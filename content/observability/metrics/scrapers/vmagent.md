---
title: "3. VMAgent: scrape and forward metrics"
tags:
---

##  What it is

**VMAgent** is the lightweight scraper from the VictoriaMetrics project. Its only job is:

1. Read a **Prometheus-style scrape config** (the same YAML format Prometheus uses).
2. **Pull** metrics from the configured targets at the configured interval.
3. **Forward** them to one or more storage backends via Prometheus `remote_write`.

It does **not** store data locally beyond a small write-ahead-log buffer (used as protection against transient storage outages). It does **not** answer queries. It's a pure agent — install it, point it at targets and a storage URL, forget about it.

Compared to running Prometheus in scrape-only mode, VMAgent uses about **10× less RAM** at equivalent scrape load (one of the reasons VictoriaMetrics is so popular at scale).

In this architecture, VMAgent runs on the dedicated `vmagent` VM and:

- Scrapes [node-exporter](../exporters/node-exporter) on the VPS (currently the only target).
- Writes everything to [VictoriaMetrics](../storage/victoriametrics) on the VPS via `remote_write`.

Both connections happen over the **private LAN** between the two hosts.

##  Installation (binary + systemd, on `vmagent`)

> [!IMPORTANT]
> This runs on the `vmagent` VM, not on the VPS. From here on, every command is **on the `vmagent` host**.

VMAgent doesn't have a Debian/Ubuntu package. It's a single Go binary, distributed via GitHub Releases. We install it as a systemd service running as a dedicated user — the standard Linux pattern for daemons.

### Download the binary

Pick the latest release from [VictoriaMetrics releases](https://github.com/VictoriaMetrics/VictoriaMetrics/releases). At time of writing, `v1.107.0`:

```bash
cd /tmp
VM_VERSION=v1.107.0
wget "https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/${VM_VERSION}/vmutils-linux-amd64-${VM_VERSION}.tar.gz"
tar -xzf "vmutils-linux-amd64-${VM_VERSION}.tar.gz"
```

The tarball contains several tools (`vmagent-prod`, `vmctl-prod`, `vmalert-prod`, `vmauth-prod`, `vmbackup-prod`, `vmrestore-prod`). We only need `vmagent-prod`:

```bash
sudo mv vmagent-prod /usr/local/bin/vmagent
sudo chmod +x /usr/local/bin/vmagent
# Clean up
rm -f vmutils-linux-amd64-${VM_VERSION}.tar.gz vm*-prod
```

Verify the binary runs:

```bash
vmagent --version
# Expected: vmagent-20XX-XX-XX-... go-version-... ...
```

### Create a dedicated user and directories

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin vmagent
sudo mkdir -p /etc/vmagent /var/lib/vmagent
sudo chown -R vmagent:vmagent /var/lib/vmagent
```

- `/etc/vmagent/` — config file.
- `/var/lib/vmagent/` — write-ahead-log buffer (used when the storage is unreachable).
- The `vmagent` user is a system account, no shell, no home directory — least privilege.

### Write the scrape config

```bash
sudo nano /etc/vmagent/vmagent.yml
```

Paste this content (replace `<VPS_PRIVATE_IP>` with the VPS's private LAN IP, the one node-exporter listens on):

```yaml
global:
  scrape_interval: 15s
  external_labels:
    cluster: 'home'

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets:
          - '<VPS_PRIVATE_IP>:9100'
        labels:
          host: 'vps-personaldomain'
```

Key concepts:

- **`scrape_interval: 15s`** — every 15 seconds, hit every target. Lower interval = higher resolution but more disk usage. 15s is the de-facto standard.
- **`external_labels: { cluster: 'home' }`** — attached to *every* metric sent by this agent. Useful when you have multiple environments writing to the same VictoriaMetrics (e.g. `cluster: 'prod'`, `cluster: 'staging'`). For now, just a placeholder.
- **`job_name: 'node'`** — a logical grouping. Every metric scraped from these targets will carry `job="node"` as label. Standard convention for node-exporter targets.
- **`labels: { host: 'vps-personaldomain' }`** — per-target labels. They get attached to every metric from that specific target. Useful for distinguishing servers.

This config will grow as you add targets. The format is identical to Prometheus, so anything you find in Prometheus' docs about `scrape_configs` works here too.

### Create the systemd unit

```bash
sudo nano /etc/systemd/system/vmagent.service
```

Paste (replace `<VPS_PRIVATE_IP>` in the `-remoteWrite.url` line):

```ini
[Unit]
Description=VMAgent - VictoriaMetrics scraper
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vmagent
Group=vmagent
ExecStart=/usr/local/bin/vmagent \
  -promscrape.config=/etc/vmagent/vmagent.yml \
  -remoteWrite.url=http://<VPS_PRIVATE_IP>:8428/api/v1/write \
  -remoteWrite.tmpDataPath=/var/lib/vmagent \
  -httpListenAddr=127.0.0.1:8429
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

> [!TIP]
> **Why hardcode the flags in the systemd unit instead of putting everything in the YAML?**
>
> There's a deliberate separation between two kinds of configuration:
>
> - **Infrastructure flags** (CLI args in the systemd unit): "where do I send data?", "where do I buffer?", "which port for my debug UI?". These change very rarely — only when you fundamentally restructure your topology.
> - **Scrape configuration** (the YAML file): "which targets do I scrape?", "with what interval?", "with what labels?". These change *often*, every time the fleet grows or shrinks.
>
> The two kinds also have different reload mechanics: change the YAML and trigger `POST /-/reload` to apply without restart; change the systemd unit and you need a full service restart. Keeping the slow-moving infra config out of the YAML is intentional — your hot-reload doesn't have to worry about it.

### Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vmagent
sudo systemctl status vmagent
```

Expected: `Active: active (running)`. If not, immediately:

```bash
sudo journalctl -u vmagent -n 50 --no-pager
```

##  Verify end-to-end

Three layers of verification, from "VMAgent is happy" to "data made it to storage".

### 1. VMAgent itself

```bash
curl -s http://127.0.0.1:8429/metrics | head -10
# Expected: VMAgent's own self-metrics (vm_app_uptime_seconds, etc.)

curl -s http://127.0.0.1:8429/targets
# Expected: HTML page listing the target <VPS_PRIVATE_IP>:9100 with state "up"
```

The `/targets` endpoint is **the** most useful debug page: it tells you which targets are being scraped, when the last scrape was, how many samples it collected, and the exact error if it's failing.

### 2. Network: can VMAgent reach both endpoints?

From `vmagent`:

```bash
# Reach the scrape target (node-exporter on the VPS)
curl -sf http://<VPS_PRIVATE_IP>:9100/metrics | head -3
# Expected: # HELP ... # TYPE ... etc.

# Reach the remote_write endpoint (VictoriaMetrics on the VPS)
curl -sf http://<VPS_PRIVATE_IP>:8428/health
# Expected: OK
```

If either of these fails, the scrape job in `/targets` will show "down" with the connection error — fix the network first, the rest will work automatically.

### 3. Data actually arrived in VictoriaMetrics

From the **VPS** (or from anywhere with access to VMUI):

```bash
curl -s "http://<VPS_PRIVATE_IP>:8428/api/v1/query?query=up" | jq
```

Expected output (abbreviated):

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "__name__": "up",
          "cluster": "home",
          "host": "vps-personaldomain",
          "instance": "<VPS_PRIVATE_IP>:9100",
          "job": "node"
        },
        "value": [<timestamp>, "1"]
      }
    ]
  }
}
```

`value: "1"` means **up** — VMAgent successfully scraped the target during the last scrape interval.

You can also open VMUI in a browser: `http://<VPS_PRIVATE_IP>:8428/vmui` and query `up` — you should see a flat line at `y=1`.

This is the **first end-to-end success**: node-exporter → VMAgent → VictoriaMetrics → query. The architecture works.

##  Reload config without restarting

After editing `/etc/vmagent/vmagent.yml`, you can trigger a config reload without bouncing the service:

```bash
curl -X POST http://127.0.0.1:8429/-/reload
```

VMAgent rereads the file and applies the new scrape targets. Way better than `systemctl restart` (which would flush the in-memory buffers).

##  Adding more targets later

The same agent can scrape many targets. Just edit the config and reload:

```yaml
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets:
          - '<VPS_PRIVATE_IP>:9100'
        labels:
          host: 'vps-personaldomain'
      - targets:
          - '10.0.0.20:9100'
        labels:
          host: 'app-server-01'

  - job_name: 'nginx'
    static_configs:
      - targets:
          - '<VPS_PRIVATE_IP>:9913'
```

Each `job_name` is independent. Labels attached at job/target level become queryable in PromQL (`up{job="nginx"}` shows only nginx-exporter targets).

##  Scaling horizontally: multiple agents

A single VMAgent on a single VM is fine up to a few hundred targets. Past that, on production fleets of 2000+ machines, you scale horizontally. **You do not put a load balancer in front of the scrapers** — the pull-based model doesn't work that way. Instead, VMAgent supports **native sharding** built into the agent itself.

### Why not a load balancer

A load balancer makes sense when N clients send requests to M servers (the Web pattern). Scrapers are the opposite: N scrapers go *out* to contact M targets. The question isn't "how do I distribute incoming requests?", it's "how do I decide which scraper handles which target?".

A LB in front would also become a single point of failure and a throughput bottleneck, and it wouldn't solve the assignment problem at all. The pattern is different.

### Pattern 1 — Native sharding (consistent hashing)

VMAgent has three built-in flags that automatically split the work across multiple instances:

```bash
-promscrape.cluster.membersCount=10       # total agents in the cluster
-promscrape.cluster.memberNum=3           # this agent's index (0..N-1)
-promscrape.cluster.name=production       # cluster name (optional, helpful for logs)
```

All agents load **the exact same scrape config** containing all 2000 targets. Internally, each agent computes `hash(target) % membersCount` and scrapes **only** the targets whose hash matches its own `memberNum`. Result:

- 10 agents, 2000 targets → each agent scrapes ~200 targets
- **Zero overlap**, zero coordination protocol, zero duplicated data
- Add an agent? Bump `membersCount` to 11, assign a new `memberNum`, rolling restart → targets redistribute via consistent hashing with minimal disruption

The huge advantage: **linear horizontal scalability**. 2000 targets → 10 agents. 20000 targets → 100 agents. Same config, no extra code.

**Limit**: if one agent dies, the ~200 targets it owned stop being scraped until you replace it (or the cluster rebalances). For that, see pattern 2.

### Pattern 2 — Replication factor (HA)

Add one more flag:

```bash
-promscrape.cluster.replicationFactor=2
```

Now **each target is scraped by 2 agents simultaneously**. If one agent dies, the other keeps scraping. To stop the duplicated samples from polluting your storage, enable deduplication on VictoriaMetrics:

```bash
-dedup.minScrapeInterval=15s
```

VM identifies duplicates (same target, same label set, same timestamp ± `minScrapeInterval`) and keeps only one copy.

Result:

- 10 agents + `replicationFactor=2` → each agent scrapes ~400 targets (200 "primary" + 200 "secondary")
- An agent can die with **no data loss**
- Double scrape load — the price of HA

### Pattern 3 — Functional sharding (topology-driven)

When targets are naturally grouped (per datacenter, environment, network segment) and a single agent can't reach all of them, you use **different agents with different configs**:

- `vmagent-dc1` — scrapes only the 800 targets in DC1
- `vmagent-dc2` — scrapes only the 700 targets in DC2
- `vmagent-public-cloud` — scrapes only the 500 targets on AWS

This is more rigid than consistent hashing but necessary when, e.g., targets behind a firewall are reachable **only** from a specific agent. Often combined with pattern 1: each "group" is itself a cluster of sharded agents.

### Production-typical setup

For a fleet of 2000+ machines, the common combination is:

- **N agents** with `membersCount=N` (e.g. N=10)
- **`replicationFactor=2`** for resistance to single-agent failure
- All agents point to the same VictoriaMetrics cluster via `-remoteWrite.url`
- Multiple `-remoteWrite.url=...` flags for **fan-out** to two independent VM clusters (active-active write redundancy)
- **Deduplication** enabled on VM with `-dedup.minScrapeInterval`

Operationally, agents run as a **Kubernetes deployment** or a systemd group across VMs, with an external controller (Ansible/Salt/k8s operator) managing `memberNum` correctly. When you add an agent, the controller increments `membersCount` and assigns the new `memberNum`.

### Kubernetes shortcut

If your environment is Kubernetes-native, the **VictoriaMetrics Operator** handles all of this declaratively. You define a `VMAgent` Custom Resource with `replicaCount: 5` and the operator:

- Sets the cluster flags correctly on each pod
- Manages rolling restarts
- Rebalances on `replicaCount` changes

You just declare "I want 5 replicas", nothing else.

##  Things to know

- **No auth between VMAgent and VictoriaMetrics**: like the rest of the pipeline, we rely on the LAN being private. If you ever expose VM publicly, add `vmauth` (the official auth proxy) in front.
- **Buffer persistence**: if VictoriaMetrics goes down, VMAgent doesn't drop data — it queues to `/var/lib/vmagent` and replays when VM is back. Default queue limit ~1 GiB. Check `vmagent_remotewrite_pending_data_bytes` to monitor.
- **Multiple `remote_write` URLs**: you can have VMAgent fan out the same data to two storages (`-remoteWrite.url=http://...A:8428/... -remoteWrite.url=http://...B:8428/...`). Classic HA pattern: two independent VM instances getting the same stream.
- **Scrape errors are visible**: if a target stops responding, you don't lose the *fact* of the failure — VMAgent emits `up{job="..."}=0` for that target, which you can alert on.
- **The LAN routing is the silent dependency**: every metric goes over it twice (scrape pull, remote_write push). If the network is shaky, the buffer fills up — keep an eye on `/var/lib/vmagent` disk usage during incidents.

##  Where to next

VMAgent is now collecting data from node-exporter and pushing it to VictoriaMetrics. The pipeline is alive end-to-end.

What's missing: **a way to look at the data** with proper graphs. Time for [Grafana](../visualization/grafana).