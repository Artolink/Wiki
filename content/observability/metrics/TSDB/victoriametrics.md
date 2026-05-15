---
title: "2. VictoriaMetrics: store and query metrics"
tags:
---

##  What it is

**VictoriaMetrics** is a single-binary, open-source time-series database (TSDB). 

It's API-compatible with Prometheus (same PromQL, same `remote_write` protocol, same `/api/v1/query` endpoints) but written in Go with much more aggressive compression and a tighter operational footprint:

- ~10× less disk per sample than Prometheus
- Half the RAM of Prometheus at equal load
- Handles high-cardinality metrics (millions of label combinations) without falling over
- One binary, one config file

In this architecture, VictoriaMetrics has two jobs:

1. **Receive** metrics from our VMAgent.
2. **Answer** PromQL queries from Grafana.

It runs in a **Docker container on the VPS**, with persistent storage on a bind-mount in `~/observability/`.

##  1. Installation

### 1. Create the directories

```bash
mkdir -p ~/observability/victoriametrics-data
cd ~/observability
```

### 2. Set ownership to UID 1000

> [!WARNING]
> **This step is not optional.** VictoriaMetrics runs as **UID 1000** inside the container (forced by the `user: "1000:1000"` directive in our compose file). If the bind-mount directory belongs to anyone else (root, your own user with a UID different from 1000...) the container can't write the lock file at startup and crashes with `cannot create lock file ... permission denied`.

```bash
sudo chown -R 1000:1000 victoriametrics-data
```

### 3. The `docker-compose.yml`

Create `~/observability/docker-compose.yml` with this content:

```yaml
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.107.0
    container_name: victoriametrics
    restart: unless-stopped
    user: "1000:1000"
    ports:
      # Bind to the VPS private LAN IP only — NOT 0.0.0.0.
      # This makes :8428 reachable from vmagent but invisible from the public Internet.
      - "<VPS_PRIVATE_IP>:8428:8428"
    volumes:
      - ./victoriametrics-data:/storage
    command:
      - "-storageDataPath=/storage"
      - "-retentionPeriod=1"           # months — adjust as needed (e.g. 12 for one year)
      - "-httpListenAddr=:8428"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8428/health"]
      interval: 30s
      timeout: 3s
      retries: 3

networks:
  default:
    name: observability
```

A few details that matter:

- **`-retentionPeriod=1`** is months (the default). Start with 1, raise to 6 or 12 when you know the disk usage. On a small VPS with 2 targets and standard scrape interval, expect 30-50 MB/month.
- **`networks.default.name: observability`** creates a named bridge network. When we add Grafana to this compose file later, it'll be on the same network and reach VM via DNS name `victoriametrics:8428` (no port mapping needed for that).
- The version tag (`v1.107.0`) is **pinned**. Never use `:latest` for any long-running service: upgrades go through your patch management procedure, not silently on container restart.

### 4.  Start it up

```bash
cd ~/observability
docker compose up -d
```

Verify it's running:

```bash
docker compose ps
```

If it's not healthy, check the logs:

```bash
docker compose logs victoriametrics --tail=50
```

The two most common failures:
- `permission denied` on `/storage`: you skipped the `chown` in step 2.
- Port already in use: something else is on `:8428` on the VPS, so change the host-side port.

###  5. Persistence

Where does the data live?

With this configuration, everything VictoriaMetrics writes goes to `~/observability/victoriametrics-data/` on the VPS host (the bind-mount). 

This means:

- `docker compose down` doesn't delete data.
- `docker compose down -v` doesn't delete data (named volumes aren't used).
- `rm -rf ~/observability/victoriametrics-data/` **does** delete data: be careful.
- Backups are a regular file backup of that directory. 
  To take a consistent backup, VM supports a snapshot API:
  ```bash
  curl http://<VPS_PRIVATE_IP>:8428/snapshot/create
  # Returns the snapshot name, then tar that subfolder of ./victoriametrics-data
  ```

Of course more interesting configurations can be done: bind-mount is the simplest option, but `-storageDataPath` can point at any mounted filesystem, for example:

- **NFS**: easy to set up, survives the VPS dying, but its slower than local disk on writes.
- **Ceph RBD**: distributed block storage, both fault-tolerant and high-throughput. 
  

##  2. Validation

From the **VPS** itself:

```bash
# Health endpoint
curl http://<VPS_PRIVATE_IP>:8428/health
# Expected: "OK"

# Self-metrics (VM exposes its own metrics for monitoring itself — meta!)
curl -s http://<VPS_PRIVATE_IP>:8428/metrics | head -20
```

From the **wider Internet** (your laptop, your phone on mobile data):

```bash
curl http://<VPS_PUBLIC_IP>:8428/health
# Expected: connection refused / timeout
```

The second `curl` **must fail**: if it succeeds, the bind isn't restricted properly and you have to re-check the `ports:` line in the compose file.

From **vmagent** (over the LAN):

```bash
curl http://<VPS_PRIVATE_IP>:8428/health
# Expected: "OK"
```

This of course, has to succeed.

## 3. Hardening

We already did application-level hardening when we created our docker-compose.yml: the `ports: "<VPS_PRIVATE_IP>:8428:8428"` bind already protects you from the public Internet. 

Now, we could do some network hardening via iptables, [[node-exporter#3. Hardening|like we did with our node-exporter]]... but this time its different, since VictoriaMetrics is a Docker container. 

Actually, Docker doesn't open `:8428` on the public IP at all. 

But if we want to look from the private LAN perspective, **any** other host could theoretically reach VictoriaMetrics and write (or read) metrics. So for defense in depth, we can add an explicit firewall rule allowing only our `vmagent` to talk to `:8428`.

### Explanation

For native services like node-exporter, you'd write a rule in the `INPUT` chain:

```bash

iptables -A INPUT -p tcp --dport 9100 -s <VMAGENT_PRIVATE_IP> -j ACCEPT

iptables -A INPUT -p tcp --dport 9100 -j DROP

```

This works because the kernel processes `INPUT` for traffic destined to local services on the host.

**For Docker containers, this doesn't work**. Docker uses **DNAT** in the `nat` table to redirect traffic from the published port (`8428` on the host) to the container's internal IP. 

The packets are processed in the `FORWARD` chain (not `INPUT`), and Docker installs its own rules in custom chains called `DOCKER` and `DOCKER-USER`. 

An `iptables -A INPUT -j DROP` rule, for example, **will not stop traffic from reaching the container**, because that traffic never traverses `INPUT` in the first place.

The right place to filter is `DOCKER-USER`: a chain that Docker provides specifically for **user-defined rules** that run *before* its automatic forwarding rules.

### Add the rule

```bash

# Allow scrape and write traffic from vmagent only

iptables -I DOCKER-USER -p tcp --dport 8428 -s <VMAGENT_PRIVATE_IP> -j ACCEPT

# Drop everything else trying to reach :8428

iptables -I DOCKER-USER -p tcp --dport 8428 -j DROP

# IMPORTANT: order matters. -I (insert) places rules at the TOP of the chain,

# so the ACCEPT must be inserted AFTER the DROP in command order — that way

# the ACCEPT ends up above the DROP in the chain. Verify with:

iptables -nvL DOCKER-USER

```

Expected output (the order is what matters: `ACCEPT` from vmagent first, `DROP` everything else second):

```

Chain DOCKER-USER (1 references)

pkts bytes target prot opt in out source destination

0 0 ACCEPT tcp -- * * <VMAGENT_PRIVATE_IP> 0.0.0.0/0 tcp dpt:8428

0 0 DROP tcp -- * * 0.0.0.0/0 0.0.0.0/0 tcp dpt:8428

0 0 RETURN all -- * * 0.0.0.0/0 0.0.0.0/0

```

And to make it persistent across reboots, of course:

```bash

sudo netfilter-persistent save

```


##  The next step

Our DB is ready and listening on the LAN, now we need someone to *fill it with data*: [[vmagent|VMAgent]].