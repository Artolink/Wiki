---
title: "Filebeat: the log shipper for our Log system"
---
Read [[observability/logs/filebeat/_index|this Filebeat overview]] for a quick theory lesson.

This page deploys Filebeat on the host whose logs we want to collect: in this lab the VPS, but the same recipe works on any Linux box. 

The agent runs natively via `apt`, not in a container, because shipping logs from a single host has trivial filesystem and journald access requirements that a container would only complicate.

## Prerequisites

Filebeat **pushes** logs somewhere, so the consumer side has to exist first. 

If you've been following the series in the correct order, then everything below is already deployed:

- A working Logstash pool ([[observability/logs/logstash/logstash-setup|check out the Logstash setup]]).

- A working HAProxy + Keepalived HA pair with a VIP ([[networking/miscellaneous/haproxy|check out HAProxy]] + [[networking/miscellaneous/keepalived-vrrp|Keepalived VRRP]]). 
  In this guide my VIP is `10.0.0.10:5044`.

## Installation

### 1. Install Filebeat from the official repo

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

> [!IMPORTANT]
> Filebeat and Elasticsearch don't have to match versions exactly. 
> 
> Elastic guarantees forward compatibility within a major version, so a newer Filebeat against an older Elasticsearch is supported... **BUT** the reverse (older Filebeat → newer ES) is not.

### 2. `/etc/filebeat/filebeat.yml`

The shipped default config is heavy with disabled modules. 

Replace it cleanly:

> [!example]- Example: my filebeat.yml setup
> ```bash
> sudo cp /etc/filebeat/filebeat.yml /etc/filebeat/filebeat.yml.orig
>
> sudo tee /etc/filebeat/filebeat.yml > /dev/null <<'EOF'
> # ============================== Inputs ==================================
> filebeat.inputs:
>   - type: filestream
>     id: syslog-files
>     enabled: true
>     paths:
>       - /var/log/syslog
>       - /var/log/auth.log
>     fields:
>       log_source: "syslog"
>     fields_under_root: true
>
>   - type: journald
>     id: systemd
>     enabled: true
>     fields:
>       log_source: "journald"
>     fields_under_root: true
>
> # ============================== Autodiscover ============================
> # Pick up logs from any Docker container on this host automatically.
> filebeat.autodiscover:
>   providers:
>     - type: docker
>       hints.enabled: true
>
> # ============================== Processors ==============================
> processors:
>   - add_host_metadata:
>       when.not.contains.tags: forwarded
>   - add_docker_metadata: ~
>
> # ============================== Output ==================================
> # Ship to the HAProxy VIP. The two LB nodes share this VIP via Keepalived;
> # whichever HAProxy currently owns it serves the traffic, with automatic
> # failover.
> output.logstash:
>   hosts: ["10.0.0.10:5044"]
>
> # ============================== Setup ===================================
> # Output is Logstash, which writes to logs-* with its own index pattern.
> # Disable Filebeat's direct-to-ES setup steps — those target "filebeat-*"
> # indices we don't actually use here.
> setup.template.enabled: false
> setup.ilm.enabled: false
> setup.dashboards.enabled: false
>
> # ============================== Logging =================================
> logging.level: info
> logging.to_files: true
> logging.files:
>   path: /var/log/filebeat
>   name: filebeat
>   keepfiles: 7
>   permissions: 0644
> EOF
>
> sudo chmod 600 /etc/filebeat/filebeat.yml
> ```
A few notes on each section:

- **`fields_under_root: true`** promotes the custom `log_source` to a top-level field instead of nesting it under `fields.log_source`. Makes Kibana queries cleaner (`log_source:syslog` vs `fields.log_source:syslog`).
- **Autodiscover with `docker` provider + `hints.enabled: true`** auto-attaches to every running container, reads its stdout/stderr from `/var/lib/docker/containers/<id>/*.log`.
- **`add_host_metadata`** enriches every event with the hostname, OS, architecture. Crucial later when you scale beyond one shipper.
- **`add_docker_metadata`** does the same for Docker events: container name, image, labels.

> [!WARNING]
> Always disable `setup.template`, `setup.ilm`, and `setup.dashboards` when shipping to Logstash. Otherwise Filebeat tries to reach Elasticsearch directly *also*, fails because it has no ES credentials, and prints a stream of warnings at every startup. 
> 
> They're harmless, but they confuse a real diagnosis.

### 3. Sanity-check the config

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

(TLS warning is expected: we're on a private network, and Logstash's Beats input is not TLS-enabled in this lab)

If the dial-up step fails, the path between Filebeat and the VIP is broken. 

Quick reachability checks:

```bash
ping -c 2 10.0.0.10
nc -zv 10.0.0.10 5044
```

### 4. Enable and start

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


### 5. Verify end-to-end from Elasticsearch

The pipeline is Filebeat → HAProxy → Logstash → Elasticsearch. 

We can confirm each hop without touching Kibana:

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

- `agent.type: "filebeat"`: confirms the producer
- `agent.version: "8.x.x"`: Filebeat version
- `host.hostname: "<your-host>"`: host metadata processor
- `log_source: "syslog"` (or `"journald"`): the custom field we added per input
- `event.original: "May 22 10:27:19 ... systemd[1]: ..."`: the raw log line

If the count is positive and grows each time you re-run it, Filebeat → Logstash → ES is working end to end!

> [!INFO]
> To see this data in **Kibana Discover**, you need a Data View pointed at `logs-*`. 
> 
> Create it from Stack Management as described in [[observability/logs/kibana/kibana-setup#Step 7 — create a Data View|the Kibana setup]].


## Final considerations

You're done. 

Congratulations!

If you've followed the series from the start, you now have an end-to-end log pipeline running on five hosts: 

- **Elasticsearch** indexing on the VPS
- **Kibana** serving the dashboard (with anonymous read-only viewing)
- Two **Logstash workers** parsing in parallel
- Two **HAProxy + Keepalived** fronting the workers, with a single highly-available VIP
- **Filebeat** pushing syslog / journald / Docker logs into that VIP.

Smaller than what you'd run in production, but pretty identical in shape.

### General pipeline monitoring 

A log pipeline that doesn't tell you when *it itself* is broken, is half-built. 

The five-minute health round:

| Component       | Quick check                                       | Looking for                                    |
| --------------- | ------------------------------------------------- | ---------------------------------------------- |
| Elasticsearch   | `curl :9200/_cluster/health`                      | `status: yellow` (lab) / `green` (cluster)     |
| Kibana          | `curl :5601/logs/api/status`                      | HTTP 200, `overall.level: available`           |
| Logstash worker | `curl :9600`                                      | `status: green`, `events.in` rising            |
| HAProxy         | `curl :8404/;csv`                                 | both Logstash backends `UP`, `scur > 0`        |
| Keepalived      | `ip addr show \| grep 10.0.0.10`                  | VIP on MASTER, absent on BACKUP                |
| Filebeat        | `journalctl -u filebeat -n 20`                    | `Connection ... established`, no `dial` errors |

### From a lab to real production

For real production scenarios, consider:

> [!TIP] What changes when you have 2000+ machines
> - **backing up the ES data periodically:** The ILM policy from [[observability/logs/elasticsearch/elasticsearch-setup#ILM policy + index template|the Elasticsearch setup]] only *deletes* old indices, but it doesn't back anything up, and if the VPS disk dies, the logs go with it. The native answer is an ES Backup Repository, pointed at S3 or a separate volume.
> - **More Logstash workers** behind the same LB pair: HAProxy's `balance roundrobin` scales horizontally for free until you saturate the LB itself.
> - **Multiple LB pairs** geographically distributed, often with DNS round-robin in front, when one VIP can't handle the throughput anymore.
> - **A Kafka cluster between Beats and Logstash** as a buffer: absorbs traffic spikes that even a HA-LB can't smooth out, and decouples producers from consumers (LS can be down for maintenance and no events are lost).
> - **An Elasticsearch cluster** with separate node types: 3+ master, 5-20+ data, 2-4 ingest, 2-4 coordinator. This is where the real bottleneck lives (indexing throughput, shard count, JVM heap pressure).
> - **Multi-tenant Kibana spaces** so different teams can have their own dashboards, saved searches, and role-based access on the same ES backend.
