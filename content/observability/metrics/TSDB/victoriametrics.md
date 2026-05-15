---
title: "2. VictoriaMetrics: store and query metrics"
tags:
---

##  What it is

**VictoriaMetrics** (VM for short) is a single-binary, open-source time-series database. It's API-compatible with Prometheus (same PromQL, same `remote_write` protocol, same `/api/v1/query` endpoints) but written in Go with much more aggressive compression and a tighter operational footprint:

- ~10× less disk per sample than Prometheus
- Half the RAM of Prometheus at equal load
- Handles high-cardinality metrics (millions of label combinations) without falling over
- One binary, one config file, no JVM, no Cassandra, no external dependencies

For your dashboards in Grafana, **VictoriaMetrics is indistinguishable from Prometheus** — choose `Prometheus` as the datasource type, point at VM's URL, done.

In this architecture, VM has two jobs:

1. **Receive** metrics from VMAgent (via Prometheus `remote_write`).
2. **Answer** PromQL queries from Grafana.

It runs in a **Docker container on the VPS**, with persistent storage on a bind-mount in `~/observability/`.

##  Prepare the working directory

> [!IMPORTANT]
> Everything below runs on the **VPS**, not on `vmagent`. VM is the storage backend that lives next to Grafana.

### Step 1 — Create the directories

```bash
mkdir -p ~/observability/victoriametrics-data
cd ~/observability
```

### Step 2 — Set ownership to UID 1000

> [!WARNING]
> **This step is not optional.** VictoriaMetrics runs as **UID 1000** inside the container (forced by the `user: "1000:1000"` directive in our compose file). If the bind-mount directory belongs to anyone else (root, your own user with a UID different from 1000, ...) the container can't write the lock file at startup and crashes with `cannot create lock file ... permission denied`.

```bash
sudo chown -R 1000:1000 victoriametrics-data
```

### Step 3 — Verify the ownership

```bash
ls -ld victoriametrics-data
```

Expected output:

```
drwxr-xr-x 2 1000 1000 4096 May 15 09:00 victoriametrics-data
```

The `1000 1000` columns (user, group) are what matters. If you see `root root` or anything else, **redo step 2** — the container will fail to start.

##  The `docker-compose.yml`

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

- **`<VPS_PRIVATE_IP>`** must be the VPS's private LAN IP (the one `vmagent` will reach). Same value you put in node-exporter's `--web.listen-address`. With this bind syntax, Docker publishes the port *only* on that interface — the public IP doesn't see the port at all.
- **`-retentionPeriod=1`** is months (the default). Start with 1, raise to 6 or 12 when you know the disk usage. On a small VPS with ~2 targets and standard scrape interval, expect ~30-50 MB/month.
- **`user: "1000:1000"`** matches the directory ownership you set above. **Skipping the `chown` in step 2 leads to `permission denied` errors at container startup** — see the *Common errors* section at the bottom for the exact symptom.
- **`networks.default.name: observability`** creates a named bridge network. When we add Grafana to this compose file later, it'll be on the same network and reach VM via DNS name `victoriametrics:8428` (no port mapping needed for that).
- The version tag (`v1.107.0`) is **pinned**. Don't use `:latest` for any long-running service — upgrades go through your patch management procedure, not silently on container restart.

##  Start it up

```bash
cd ~/observability
docker compose up -d
```

Verify it's running:

```bash
docker compose ps
```

Expected: `victoriametrics` in `running` state with `(healthy)` after ~30 seconds (the healthcheck interval).

If it's not healthy, check the logs:

```bash
docker compose logs victoriametrics --tail=50
```

The two most common failures:
- `permission denied` on `/storage` — you skipped the `chown` in step 2. See [Common errors](#common-errors).
- Port already in use — something else is on `:8428` on the VPS, change the host-side port or stop the conflicting service.

##  First contact

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

The second `curl` **must fail** — if it succeeds, the bind isn't restricted properly. Re-check the `ports:` line in the compose file.

From **vmagent** (over the LAN):

```bash
curl http://<VPS_PRIVATE_IP>:8428/health
# Expected: "VictoriaMetrics has been started"
```

If this fails (and only this one), the LAN routing or your firewall is blocking. We'll handle the firewall rule properly in the next step alongside the VMAgent setup.


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

##  Configuration knobs you'll probably touch

For now defaults are fine. When you start tuning, these are the flags worth knowing:

| Flag | What it controls | When to change |
|---|---|---|
| `-retentionPeriod=<N>` | Months of history kept | Start with 1, raise to 12 once disk usage is known |
| `-storageDataPath=<path>` | Where samples are stored | Always set, default works inside container |
| `-search.maxQueryDuration=<d>` | Max query execution time | If you hit timeouts on large dashboards |
| `-memory.allowedPercent=<N>` | Max % of host RAM VM can use | If running on a host shared with other heavy services |
| `-dedup.minScrapeInterval=<d>` | Deduplicate samples closer than this | If you scrape from two redundant agents |

Full list: `docker run --rm victoriametrics/victoria-metrics:v1.107.0 -help` (it's long).

##  Common errors

###  `cannot create lock file ... permission denied`

```
victoriametrics | panic: FATAL: cannot create lock file: cannot create lock file "/storage/flock.lock": open /storage/flock.lock: permission denied; make sure a single process has exclusive access to "/storage"
```

**Cause**: the bind-mount directory `./victoriametrics-data` is not owned by UID 1000, but the container is forced to run as UID 1000 via `user: "1000:1000"`. The container can't write the lock file → it crashes immediately.

**Fix**:

```bash
cd ~/observability
docker compose down
sudo chown -R 1000:1000 victoriametrics-data
ls -ld victoriametrics-data
# Must show: drwxr-xr-x ... 1000 1000 ...
docker compose up -d
docker compose logs victoriametrics --tail=20
```

The container should now start cleanly. This is the most common pitfall when first deploying VM with a bind-mount — it's why step 2 of *Prepare the working directory* is non-optional.

###  Port already in use

```
Error response from daemon: driver failed programming external connectivity on endpoint victoriametrics: failed to bind host port for ...:8428: address already in use
```

**Cause**: another service on the VPS is already listening on `8428`.

**Fix** (pick one):
- Find and stop the conflicting service: `ss -tlnp | grep 8428`
- Change the host-side port mapping in the compose file: `"<VPS_PRIVATE_IP>:18428:8428"` (then your scraper and Grafana must use `:18428` to reach VM from outside the container).

###  `health` returns empty / connection refused from `vmagent`

If the three `curl` tests pass from the VPS itself but `vmagent` can't reach VM:
- Verify the `ports:` line binds to the right private IP (`ss -tlnp | grep 8428` on the VPS).
- Verify the LAN routing: `ping <VPS_PRIVATE_IP>` from `vmagent` must succeed.
- Verify no firewall rule on the VPS is blocking `8428` from the `vmagent` private IP.

##  Things to know

- **No built-in auth.** VM accepts writes and queries from anyone who can reach `:8428`. We rely entirely on the bind-to-private-IP + LAN firewall for security. If you ever want to expose VM publicly, put it behind nginx with Basic Auth or `vmauth` (their official auth proxy).
- **PromQL compatibility is near-total**, with a small superset called **MetricsQL** that adds functions Prometheus doesn't have (`histogram_quantiles`, `keep_last_value`, ...). Stick to PromQL when writing dashboards and they'll work on either backend; only reach for MetricsQL when you have a specific reason.
- **`remote_write` is the only ingestion path** we configure here, but VM also accepts InfluxDB line protocol on `/write`, OpenTSDB on `:4242`, Graphite on `:2003`. Useful if you ever migrate from one of those.
- **Upgrade strategy**: change the image tag in the compose file, `docker compose up -d`, the container restarts on the new version. Data on the bind-mount is preserved. Don't ever change retention *down* on a running instance without reading the docs — VM will delete samples older than the new retention immediately.

##  Where to next

- The storage backend is ready and listening on the LAN.
- Now we need someone to *fill it with data* → [VMAgent on vmagent](../scrapers/vmagent).