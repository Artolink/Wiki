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

##  2. Validation

From the **VPS** itself:

```bash
# Health endpoint
curl http://<VPS_PRIVATE_IP>:8428/health
# Expected: "VictoriaMetrics has been started"

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
# Expected: "VictoriaMetrics has been started"
```

This of course, has to succeed.


##  Persistence: where does the data live?

Everything VM writes goes to `~/observability/victoriametrics-data/` on the VPS host (the bind-mount). This means:

- `docker compose down` doesn't delete data.
- `docker compose down -v` doesn't delete data (named volumes aren't used).
- `rm -rf ~/observability/victoriametrics-data/` **does** delete data — be careful.
- Backups are a regular file backup of that directory. To take a consistent backup, VM supports a snapshot API:

  ```bash
  curl http://<VPS_PRIVATE_IP>:8428/snapshot/create
  # Returns the snapshot name, then tar that subfolder of ./victoriametrics-data
  ```

Disk growth on a 2-target setup with default scrape interval (15s): about **30-50 MB per month**. On a small VPS this is negligible; on a fleet of 100 hosts it becomes a number to plan for, and at that scale you'd consider raising the retention or migrating to VM cluster mode.

##  Things to know

- **No built-in auth.** VM accepts writes and queries from anyone who can reach `:8428`. We rely entirely on the bind-to-private-IP + LAN firewall for security. If you ever want to expose VM publicly, put it behind nginx with Basic Auth or `vmauth` (their official auth proxy).


##  The next steps

- The storage backend is ready and listening on the LAN.
- Now we need someone to *fill it with data* → [VMAgent on vmagent](../scrapers/vmagent).