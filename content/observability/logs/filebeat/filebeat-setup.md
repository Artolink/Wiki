---
title: Filebeat — Setup
description: Install Filebeat natively on the VPS, configure inputs for syslog + journald + Docker autodiscover, and ship to the Logstash worker.
---

This page deploys Filebeat on the VPS — the one host whose logs we actually want to collect (the four Tailscale VMs are pure log infrastructure; their own logs are nice-to-have but not the point of this exercise). The agent runs natively via `apt`, not in a container, because shipping logs from a single host has trivial filesystem and journald access requirements that a container would only complicate.

## Why "native" and not Docker

Three reasons:

1. **Filesystem access**: reading `/var/log/syslog` and the systemd journal from a container would mean bind-mounting `/var/log`, `/var/log/journal`, `/run/log/journal`, plus the runtime journald socket — workable, fragile, and the kind of detail that breaks after a host upgrade.
2. **Docker autodiscover**: Filebeat reads `/var/run/docker.sock` to discover running containers. Inside Docker it's a layered indirection.
3. **A single-host log shipper does not need orchestration.** Filebeat is one binary, one config file, one systemd unit. The container packaging is appropriate when you replicate the same shipper across many short-lived workloads (Kubernetes DaemonSet) — not on a single VPS that gets touched twice a year.

On the VMs that run Logstash (`logstash01`, `logstash02`) we use Docker because they need *Logstash* (a heavyweight JVM application that benefits from the consistent runtime). Here we use native because Filebeat is a Go binary, no JVM, no friction.

## Prerequisites

- A working Logstash worker pool (see [[observability/logs/logstash/logstash-setup|logstash-setup]]).

- A working HAProxy + Keepalived HA pair with a VIP (see [[networking/miscellaneous/haproxy|haproxy]] and [[networking/miscellaneous/keepalived-vrrp|keepalived-vrrp]]). In this guide the VIP is `10.0.0.10:5044`.

- A user with sudo on the host whose logs you want to collect (in this lab: the VPS).
- 

## Step 1 — install Filebeat 8.x from the official Elastic APT repo

```bash
# Elastic GPG key
sudo install -m 0755 -d /etc/apt/keyrings
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch \
  | sudo gpg --dearmor -o /etc/apt/keyrings/elastic.gpg
sudo chmod a+r /etc/apt/keyrings/elastic.gpg

# Elastic 8.x APT repo
echo "deb [signed-by=/etc/apt/keyrings/elastic.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/elastic-8.x.list

sudo apt update
sudo apt install -y filebeat

# Verify
filebeat version
# filebeat version 8.x.x (amd64), libbeat 8.x.x [...]
```

> [!INFO]
> Filebeat and Elasticsearch don't have to match versions exactly. The "8.x" repo gets you the latest 8.x, which talks to ES 8.15 fine. Elastic guarantees forward compatibility within a major version — a newer Filebeat against an older ES is supported; the reverse (older Filebeat → newer ES) is not.

## Step 2 — `/etc/filebeat/filebeat.yml`

The shipped default config is heavy with disabled modules. Replace it cleanly:

```bash
sudo cp /etc/filebeat/filebeat.yml /etc/filebeat/filebeat.yml.orig

sudo tee /etc/filebeat/filebeat.yml > /dev/null <<'EOF'
# ============================== Inputs ==================================
filebeat.inputs:
  - type: filestream
    id: syslog-files
    enabled: true
    paths:
      - /var/log/syslog
      - /var/log/auth.log
    fields:
      log_source: "syslog"
    fields_under_root: true

  - type: journald
    id: systemd
    enabled: true
    fields:
      log_source: "journald"
    fields_under_root: true

# ============================== Autodiscover ============================
# Pick up logs from any Docker container on this host automatically.
filebeat.autodiscover:
  providers:
    - type: docker
      hints.enabled: true

# ============================== Processors ==============================
processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_docker_metadata: ~

# ============================== Output ==================================
# Phase 4: ship directly to logstash01 over Tailscale.
# Phase 5 will replace this with the HAProxy VIP for HA + load balancing.
output.logstash:
  hosts: ["10.0.0.10:5044"]

# ============================== Setup ===================================
# Output is Logstash, which writes to logs-* with its own index pattern.
# Disable Filebeat's direct-to-ES setup steps — those target "filebeat-*"
# indices we don't actually use here.
setup.template.enabled: false
setup.ilm.enabled: false
setup.dashboards.enabled: false

# ============================== Logging =================================
logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0644
EOF

sudo chmod 600 /etc/filebeat/filebeat.yml
```

A few notes on each section:

- **`filestream`** is the modern replacement for the deprecated `log` input. Same purpose (tail a file), better at handling rotations and renames, and the only one Elastic adds new features to. Use it for any new deploy.
- **`journald`** input pulls from the systemd journal directly. No need to redirect journald to a file first. Captures all units' stdout by default; you can filter with `include_matches: ["_SYSTEMD_UNIT=ssh.service"]`.
- **`fields_under_root: true`** promotes the custom `log_source` to a top-level field instead of nesting it under `fields.log_source`. Makes Kibana queries cleaner (`log_source:syslog` vs `fields.log_source:syslog`).
- **Autodiscover with `docker` provider + `hints.enabled: true`** auto-attaches to every running container, reads its stdout/stderr from `/var/lib/docker/containers/<id>/*.log`. Containers can opt in/out via Docker labels (the "hints").
- **`add_host_metadata`** enriches every event with the hostname, OS, architecture. Crucial later when you scale beyond one shipper.
- **`add_docker_metadata`** does the same for Docker events: container name, image, labels.

> [!WARNING]
> Always disable `setup.template`, `setup.ilm`, and `setup.dashboards` when shipping to Logstash. Otherwise Filebeat tries to reach Elasticsearch directly *also*, fails because it has no ES credentials, and prints a stream of warnings at every startup. They're harmless but they confuse a real diagnosis.

## Step 3 — sanity-check the config

```bash
# YAML / structure validation
sudo filebeat test config

# Connectivity to the configured output (TCP reach + protocol handshake)
sudo filebeat test output
```

Expected output for the second one:

```
logstash: 10.0.0.10:5044...
  connection...
    parse host... OK
    dns lookup... OK
    addresses: 10.0.0.10
    dial up... OK
  TLS... WARN secure connection disabled
  talk to server... OK
```

(TLS warning is expected — we're on a private Tailscale mesh, and Logstash's Beats input is not TLS-enabled.)

If the dial-up step fails, the path between Filebeat and Logstash is broken. Quick reachability checks:

```bash
ping -c 2 10.0.0.10
nc -zv 10.0.0.10 5044
```

## Step 4 — enable and start

```bash
sudo systemctl enable filebeat
sudo systemctl start filebeat
sudo systemctl status filebeat --no-pager
```

Then watch the agent's own log:

```bash
sudo journalctl -u filebeat -n 30 --no-pager
```

What you want to see:

```
Connecting to backoff(async(tcp://10.0.0.10:5044))
Connection to backoff(...) established
```

If you see `Failed to connect to backoff`, the output isn't reachable — re-run `filebeat test output`, fix the network, and Filebeat will reconnect on its own (it backoff-retries forever).


## Step 5 — verify end-to-end from Elasticsearch

The pipeline is Filebeat → Logstash → Elasticsearch. We can confirm each hop without touching Kibana:

```bash
ELASTIC=$(sudo grep '^ELASTIC_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)

# Index showing up?
curl -s -u "elastic:$ELASTIC" "http://localhost:9200/_cat/indices?v" | grep "logs-"

# Event count
curl -s -u "elastic:$ELASTIC" "http://localhost:9200/logs-*/_count" | python3 -m json.tool

# Peek at a recent document to see fields
curl -s -u "elastic:$ELASTIC" "http://localhost:9200/logs-*/_search?size=1&sort=@timestamp:desc" \
  | python3 -m json.tool | head -40
```

What to look for in a sample document:

- `agent.type: "filebeat"` — confirms the producer
- `agent.version: "8.x.x"` — Filebeat version
- `host.hostname: "personalDomain"` — host metadata processor
- `log_source: "syslog"` (or `"journald"`) — the custom field we added per input
- `event.original: "May 22 10:27:19 personalDomain systemd[1]: ..."` — the raw log line

If the count is positive and grows each time you re-run it, Filebeat → Logstash → ES is working end to end.

> [!INFO]
> To see this data in **Kibana Discover**, you need a Data View pointed at `logs-*`. Create it from Stack Management as described in [[observability/logs/kibana/kibana-setup#Step 7 — create a Data View|kibana-setup]] — the same view is automatically usable by the public anonymous viewer once it exists.

