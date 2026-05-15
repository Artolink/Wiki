---
title: "3. VMAgent: scrape and forward metrics"
tags:
---

##  What it is

**VMAgent** is the lightweight scraper from the VictoriaMetrics project. 

Its only job is:

1. Read a **Prometheus-style scrape config**
2. **Pull** metrics from the configured targets at the configured interval
3. **Forward** them to one or more storage backends via Prometheus `remote_write`

It does **not** store data locally beyond a small write-ahead-log buffer (used as protection against transient storage outages). 

It does **not** answer queries. 

It's a pure agent: install it, point it at targets and a TSDB URL, forget about it.

Actually, Prometheus can be used in scrape-only mode too, but VMAgent uses about **10× less RAM** at equivalent scrape load (one of the reasons VictoriaMetrics is so popular at scale).

In this architecture, VMAgent runs on the dedicated `vmagent` VM and:

- Scrapes [node-exporter](../exporters/node-exporter) on my VPS (my only target).
- Writes everything to [VictoriaMetrics](../storage/victoriametrics) on the VPS via `remote_write`.

Both connections happen over the **private LAN** between the two hosts.

##  1. Installation

VMAgent doesn't have a Debian/Ubuntu package. 

It's a single Go binary, distributed via GitHub Releases. 

We install it as a systemd service running as a dedicated user (the standard Linux pattern for daemons).

### 1. Download the binary

Pick the latest release from [VictoriaMetrics releases](https://github.com/VictoriaMetrics/VictoriaMetrics/releases):

```bash
cd /tmp
VM_VERSION=v1.107.0
wget "https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/${VM_VERSION}/vmutils-linux-amd64-${VM_VERSION}.tar.gz"
tar -xzf "vmutils-linux-amd64-${VM_VERSION}.tar.gz"
```

The tarball contains several tools (`vmagent-prod`, `vmctl-prod`, `vmalert-prod`, `vmauth-prod`, `vmbackup-prod`, `vmrestore-prod`), but we only need the first one:

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

### 2. Create a dedicated user and directories

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin vmagent
sudo mkdir -p /etc/vmagent /var/lib/vmagent
sudo chown -R vmagent:vmagent /var/lib/vmagent
```

- `/etc/vmagent/` is for the config file.
- `/var/lib/vmagent/` is for the write-ahead-log buffer (used when the storage is unreachable).


### 3. Write the scrape config

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

- **`scrape_interval: 15s`**: every 15 seconds, hit every target. Lower interval = higher resolution but more disk usage. 15s is the de-facto standard.
- **`external_labels: { cluster: 'home' }`**: attached to *every* metric sent by this agent. Useful when you have multiple environments writing to the same VictoriaMetrics (e.g. `cluster: 'prod'`, `cluster: 'staging'`). For now, just a placeholder.
- **`job_name: 'node'`**: a logical grouping. Every metric scraped from these targets will carry `job="node"` as label. Standard convention for node-exporter targets.
- **`labels: { host: 'vps-personaldomain' }`**: per-target labels. They get attached to every metric from that specific target. Useful for distinguishing servers.

This config will grow as you add targets.

### 4. Create the systemd unit

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

> [!INFO]
> **Why hardcoding the flags in the systemd unit instead of putting everything in the YAML?**
>
> There's a deliberate separation between two kinds of configuration:
>
> - **Infrastructure flags** (CLI args in the systemd unit): "where do I send data?", "where do I buffer?", "which port for my debug UI?". These change very rarely: only when you fundamentally restructure your infrastructure.
> - **Scrape configuration** (the YAML file): "which targets do I scrape?", "with what interval?", "with what labels?". These change *often*, every time the fleet grows or shrinks.

### 5. Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vmagent
sudo systemctl status vmagent
```

Expected: `Active: active (running)`. If not, immediately:

```bash
sudo journalctl -u vmagent -n 50 --no-pager
```

##  2. Validation

Three layers of verification, from "VMAgent is happy" to "data made it to the DB".
### 1. VMAgent itself

```bash
curl -s http://127.0.0.1:8429/metrics | head -10
# Expected: VMAgent's own self-metrics (vm_app_uptime_seconds, etc.)

curl -s http://127.0.0.1:8429/targets
# Expected: HTML page listing the target <VPS_PRIVATE_IP>:9100 with state "up"
```

The `/targets` endpoint is **the** most useful debug page: it tells you which targets are being scraped, when the last scrape was, how many samples it collected, and the exact error if it's failing.

### 2. Network reachability

Can VMAgent reach both endpoints? From `vmagent`:

```bash
# Reach the scrape target (node-exporter on the VPS)
curl -sf http://<VPS_PRIVATE_IP>:9100/metrics | head -3
# Expected: # HELP ... # TYPE ... etc.

# Reach the remote_write endpoint (VictoriaMetrics on the VPS)
curl -sf http://<VPS_PRIVATE_IP>:8428/health
# Expected: OK
```

If either of these fails, the scrape job in `/targets` will show "down" with the connection error: fix the network first, the rest will work automatically.

### 3. Data in VictoriaMetrics

From the **VPS** (or from anywhere with access to VictoriaMetrics):

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

`value: "1"` means **up**: VMAgent successfully scraped the target during the last scrape interval.

This is the **first end-to-end success**: node-exporter → VMAgent → VictoriaMetrics → query. 

The architecture works.


## 3. Tips

Here are a few general things to know that can be very helpful in real production scenarios:

- **Buffer persistence**: if VictoriaMetrics goes down, VMAgent doesn't drop data: it queues to `/var/lib/vmagent` and replays when VM is back. Default queue limit ~1 GiB. 
  Check `vmagent_remotewrite_pending_data_bytes` for monitoring it!
- **Multiple `remote_write` URLs**: you can have VMAgent fan out the same data to two storages (`-remoteWrite.url=http://...A:8428/... -remoteWrite.url=http://...B:8428/...`). Classic HA pattern: two independent VM instances getting the same stream.
- **Scrape errors are visible**: if a target stops responding, you don't lose the *fact* of the failure: VMAgent emits `up{job="..."}=0` for that target, which you can alert on.
- **The LAN routing is the silent bottleneck**: every metric goes over it twice (scrape pull, remote_write push). If the network is shaky, the buffer fills up: keep an eye on `/var/lib/vmagent` disk usage during incidents!

And also a few tips about the configuration.
### Reload config without restarting

After editing `/etc/vmagent/vmagent.yml`, you can trigger a config reload without bouncing the service:

```bash
curl -X POST http://127.0.0.1:8429/-/reload
```

VMAgent rereads the file and applies the new scrape targets. 

Way better than `systemctl restart` (which would flush the in-memory buffers).

### Adding more targets later

The same agent can scrape many targets. 

Just edit the config and reload as I've shown you before:

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


##  4. Scaling horizontally: multiple agents

A single VMAgent on a single VM is fine up to a few hundred targets. 

Past that, on production fleets of 2000+ machines, you scale horizontally. 
### 1. Native sharding (consistent hashing)

VMAgent has three built-in flags that automatically split the work across multiple instances:

```bash
-promscrape.cluster.membersCount=10       # total agents in the cluster
-promscrape.cluster.memberNum=3           # this agent's index (0..N-1)
-promscrape.cluster.name=production       # cluster name (optional, helpful for logs)
```

All agents load **the exact same scrape config** containing all 2000 targets. 

Internally, each agent computes `hash(target) % membersCount` and scrapes **only** the targets whose hash matches its own `memberNum`. 

Result:

- 10 agents, 2000 targets → each agent scrapes ~200 targets
- **Zero overlap**, zero coordination protocol, zero duplicated data
- Add an agent? Bump `membersCount` to 11, assign a new `memberNum`, rolling restart → targets redistribute via consistent hashing with minimal disruption

The huge advantage: **linear horizontal scalability**.

**Limit**: if one agent dies, the ~200 targets it owned stop being scraped until you replace it (or the cluster rebalances). 

For that, see the next solution.

### 2. Replication factor (HA)

Add one more flag:

```bash
-promscrape.cluster.replicationFactor=2
```

Now **each target is scraped by 2 agents simultaneously**. If one agent dies, the other keeps scraping. 

To stop the duplicated samples from polluting your TSDB, enable deduplication on VictoriaMetrics:

```bash
-dedup.minScrapeInterval=15s
```

Result:

- 10 agents + `replicationFactor=2` → each agent scrapes ~400 targets (200 "primary" + 200 "secondary")
- An agent can die with **no data loss**
- But... double scrape load. the price of HA

### 3. Functional sharding (topology-driven)

When targets are naturally grouped (per datacenter, environment, network segment) and a single agent can't reach all of them, you use **different agents with different configs**:

- `vmagent-dc1`: scrapes only the 800 targets in DC1
- `vmagent-dc2`: scrapes only the 700 targets in DC2

This is more rigid than consistent hashing, but necessary when targets behind a firewall are reachable **only** from a specific agent. 

Often combined with the first technique: each "group" is itself a cluster of sharded agents.

### Production-typical setup

For a fleet of 2000+ machines, the common combination is:

- **N agents** with `membersCount=N` (e.g. N=10)
- **`replicationFactor=2`** for resistance to single-agent failure
- All agents point to the same VictoriaMetrics cluster via `-remoteWrite.url`
- Multiple `-remoteWrite.url=...` flags for **fan-out** to two independent VictoriaMetrics clusters (active-active write redundancy)
- **Deduplication** enabled on VM with `-dedup.minScrapeInterval`

Operationally, agents run as a **Kubernetes deployment**.

### Kubernetes shortcut

If your environment is Kubernetes-native, the **VictoriaMetrics Operator** handles all of this declaratively: you define a `VMAgent` Custom Resource with `replicaCount: 5` and the operator:

- Sets the cluster flags correctly on each pod
- Manages rolling restarts
- Rebalances on `replicaCount` changes

You just declare "I want 5 replicas", nothing else.


##  The last step

VMAgent is now collecting data from node-exporter and pushing it to VictoriaMetrics. 

The pipeline is alive end-to-end. What's missing? **A way to look at the data** with proper graphs. 

Time for [[grafana|Grafana]].