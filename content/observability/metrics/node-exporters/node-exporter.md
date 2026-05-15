---
title: "1. Node Exporter: expose host metrics"
tags:
---

##  What it is

**node-exporter** is the official Prometheus exporter for Linux/BSD host metrics. It reads from `/proc`, `/sys`, and standard kernel interfaces, and exposes ~500 metrics about the host on `:9100/metrics` — CPU, memory, disk usage, filesystem space, network traffic, load average, file descriptors, NTP drift, hwmon sensors, and so on.

It's the **default first exporter** anyone installs on a server. Lightweight (~10 MB RAM, ~0% CPU at idle), zero dependencies, ships in every distro's repos.

##  Installation (Ubuntu/Debian)

> [!IMPORTANT]
> This runs on the **VPS** (the machine being monitored), not on `vmagent01`. node-exporter is a **target** — it's where the metrics live; the scraper comes later.

```bash
apt update
apt install prometheus-node-exporter
```

The package:
- Installs the binary `/usr/bin/prometheus-node-exporter`.
- Creates a systemd unit `prometheus-node-exporter.service`, enabled and started by default.
- Listens on `0.0.0.0:9100` by default — **this is a problem if your VPS has a public IP**, see the *Security* section below.

Verify it's running:

```bash
systemctl status prometheus-node-exporter
```

Expected output: `Active: active (running)`. If not, `journalctl -u prometheus-node-exporter -n 50` shows what's wrong.

##  First contact: see your metrics

```bash
curl -s http://localhost:9100/metrics | head -30
```

You should see something like:

```
# HELP go_gc_duration_seconds A summary of the wall-time pause...
# TYPE go_gc_duration_seconds summary
go_gc_duration_seconds{quantile="0"} 0
...
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 12345.67
...
```

Congratulations: your server is now exposing metrics. The scraper hasn't been built yet — that's the next step — but the data is **available**.

##  Security: restrict who can reach `:9100`

By default node-exporter listens on **all interfaces** (`0.0.0.0:9100`). On a server with a public IP, that means **anyone on the Internet** can do `curl http://<your-public-ip>:9100/metrics` and read:

- All your mount points and disk usage
- All your network interfaces and IPs
- All your running processes (if the `--collector.processes` flag is enabled)
- Last reboot time, uptime, hardware info, kernel version
- (essentially, a precise reconnaissance dossier on your host)

That's a leak. Two complementary fixes — apply **both** for defense in depth:

### Fix 1: bind node-exporter to the private LAN interface only

Edit the package defaults file:

```bash
nano /etc/default/prometheus-node-exporter
```

Change the `ARGS` line to bind to the VPS's **private LAN IP** (use `ip -br -c a` to find it — it's the address on your internal LAN interface, **not** the public one):

```
ARGS="--web.listen-address=<VPS_PRIVATE_IP>:9100"
```

Then restart:

```bash
systemctl restart prometheus-node-exporter
```

Verify the listen address has changed:

```bash
ss -tlnp | grep 9100
```

You should now see node-exporter bound only to the private IP (e.g. `10.0.0.5:9100`), not `0.0.0.0:9100`. From the **public** interface, port 9100 is now invisible — no more `curl <public-ip>:9100/metrics` from anywhere on the Internet.

### Fix 2: firewall rule (defense in depth)

Even with the bind restricted, add an explicit firewall rule so that if the bind config ever drifts (you remove the flag, package update overwrites it, ...) the leak doesn't reappear.

With **iptables** (typical Ubuntu server setup, persisted by `netfilter-persistent`):

```bash
# Allow scrape from the LAN (vmagent01) — adjust to your scraper's IP
iptables -A INPUT -p tcp --dport 9100 -s <VMAGENT01_PRIVATE_IP> -j ACCEPT
# Drop from anywhere else (your default INPUT policy should already be DROP,
# this is an explicit safety net)
iptables -A INPUT -p tcp --dport 9100 -j DROP

# Persist the rule across reboots
netfilter-persistent save
```

With **ufw** (alternative, simpler):

```bash
ufw allow from <VMAGENT01_PRIVATE_IP> to any port 9100 proto tcp
```

After this, only `vmagent01` (via its LAN IP) can reach `:9100`. The wider Internet sees nothing.

> [!TIP]
> If your two machines are not on the same physical LAN, route the scrape traffic through a private overlay network (Tailscale, WireGuard, or similar). The exporter configuration is identical — only the IP you bind to / allow through the firewall changes.

##  What's inside `/metrics`

node-exporter is organised into **collectors**, each responsible for a category of metrics. By default ~30 are enabled (the "out of the box" set); others are opt-in. A few useful ones to know:

| Collector | Enabled by default? | What it exposes |
|---|---|---|
| `cpu` | yes | CPU time per mode (user/system/idle/iowait/...) |
| `meminfo` | yes | RAM usage, swap, buffers, cached |
| `diskstats` | yes | I/O per device (reads, writes, IOPS, latency) |
| `filesystem` | yes | Per-mount free space, inodes |
| `netdev` | yes | Per-interface RX/TX bytes & packets |
| `loadavg` | yes | 1/5/15-minute load |
| `uname` | yes | kernel, hostname |
| `systemd` | **no** | Status of every systemd unit (active/failed/...) |
| `processes` | **no** | Per-process count by state |
| `textfile` | yes | Custom metrics from `.prom` files in a directory — your "escape hatch" for ad-hoc metrics |

To enable `systemd` (very useful — tells you the *number of failed units* via `node_systemd_units` metrics):

```bash
nano /etc/default/prometheus-node-exporter
```

Change `ARGS` to add `--collector.systemd`:

```
ARGS="--web.listen-address=<VPS_PRIVATE_IP>:9100 --collector.systemd"
```

Restart, recheck `curl`, you'll now see `node_systemd_unit_state{...}` entries.

##  Useful metrics to remember

When you'll start writing Grafana queries, these are the bricks you'll use most:

```promql
# CPU usage (1 - idle ratio)
1 - rate(node_cpu_seconds_total{mode="idle"}[1m])

# Memory used (bytes)
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes

# Disk free on root partition
node_filesystem_avail_bytes{mountpoint="/"}

# Network throughput (bytes/s)
rate(node_network_receive_bytes_total{device!="lo"}[1m])

# Load average (1m)
node_load1
```

Don't worry about understanding them now: they'll all be in the [Grafana dashboards](../visualization/dashboards) we import later.

##  Things to know

- node-exporter is **read-only**. It cannot change the system, doesn't write anywhere, doesn't open outbound connections. The only risk is the information leak we fixed above.
- It exposes metrics in *cumulative counters* (`_total` suffix) for things that monotonically grow (CPU seconds, bytes received). The interesting value is the **rate of change**, not the raw counter — you'll see `rate(...)` everywhere in PromQL because of this.
- Custom metrics via `--collector.textfile`: drop any `.prom` file in `/var/lib/prometheus/node-exporter/` (or wherever `--collector.textfile.directory=...` points) and its content will appear in `/metrics`. Useful for cron-based custom metrics ("backup duration in seconds", "last cert rotation timestamp") without writing a full exporter.
- Memory usage stays around 10-20 MB regardless of how many metrics are exposed. Don't worry about node-exporter's footprint.

##  Where to next

Now that the VPS exposes metrics, we need:

1. A place to store them → [VictoriaMetrics](../storage/victoriametrics)
2. Someone to come pick them up → [VMAgent](../scrapers/vmagent) on `vmagent01`