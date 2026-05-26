---
title: "Elasticsearch: The JSON store and search engine for Logs"
---
Read [[observability/logs/elasticsearch/_index|this ElasticSearch overview]] for a quick theory lesson.

## Overview

This page walks through deploying Elasticsearch in a single-node Docker container on the VPS, with persistent storage on a bind-mounted volume. 

The cluster is exposed on `127.0.0.1:9200` (for local services like Kibana) and on the VPS private IP `10.0.0.5:9200` (for Logstash workers running on private VMs). 

No public exposure.

This is what's exposed and to whom:

| Address          | Reached from                                      | Purpose                                   |
| ---------------- | ------------------------------------------------- | ----------------------------------------- |
| `127.0.0.1:9200` | Same host (Kibana, local curl, etc.)              | Local services on the VPS                 |
| `10.0.0.5:9200`  | Other hosts on the private LAN (LogStash workers) | LogStash workers writing to ElasticSearch |
| Public internet  | nothing                                           | ES is never publicly addressable          |

## Prerequisites

- Docker CE installed via the official method:

  ```bash
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt update
  sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ```

- A user with sudo and the ability to run `docker compose`.
- VPS reachable on a private network at a known IP (in this guide: `10.0.0.5`).

## Installation

Before the actual installation, here are some prerequisites to set up.

### Kernel settings

> [!IMPORTANT]
> Elasticsearch uses memory-mapped files heavily and refuses to start if `vm.max_map_count < 262144`. This must be set on the *host*, not in the container.

```bash
# Apply now
sudo sysctl -w vm.max_map_count=262144

# Make it persist across reboots
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf
```

Verify:

```bash
sysctl vm.max_map_count
# vm.max_map_count = 262144
```

### Directory layout

```bash
sudo mkdir -p /opt/observability-logs/es-data
sudo chown -R 1000:1000 /opt/observability-logs/es-data
cd /opt/observability-logs
```

UID 1000 matches the `elasticsearch` user inside the official image: without this, the container can't write to the bind-mounted data directory.

### Generate the `elastic` superuser password

> [!WARNING]
> Use **hex-only** passwords. Special characters like `!` and `$` are interpreted by bash!

```bash
echo "ELASTIC=$(openssl rand -hex 24)"
```

Copy the hex value into your password manager **now** (What? You don't have one? Check [[keepass-setup|this]] out immediately!) then write it into the `.env` using EOF (the quotes around `'EOF'` stop bash from interpreting anything inside):

```bash
sudo tee /opt/observability-logs/.env > /dev/null <<'EOF'
ELASTIC_PASSWORD=<paste hex value here>
EOF
sudo chmod 600 /opt/observability-logs/.env
```


### docker-compose.yml

Create `/opt/observability-logs/docker-compose.yml`:

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    container_name: elasticsearch
    user: "1000:1000"
    environment:
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms2g -Xmx2g
      - bootstrap.memory_lock=true
      # Security ON, but TLS OFF on the HTTP layer.
      # Lab simplification: traffic stays on the private LAN.
      # In production this is non-negotiable — enable HTTPS.
      - xpack.security.enabled=true
      - xpack.security.http.ssl.enabled=false
      - xpack.security.transport.ssl.enabled=false
      - xpack.security.enrollment.enabled=false
      # Pre-set the password of the built-in `elastic` superuser so we don't
      # have to fish it out of the first-boot logs.
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    volumes:
      - /opt/observability-logs/es-data:/usr/share/elasticsearch/data
    ports:
      # Private LAN IP — for Logstash workers on dedicated VMs
      - "10.0.0.5:9200:9200"
      # Localhost — for Kibana (same host) and quick curl checks
      - "127.0.0.1:9200:9200"
    networks:
      - elk-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS -u elastic:${ELASTIC_PASSWORD} http://localhost:9200/_cluster/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5

networks:
  elk-net:
    driver: bridge
```

A few choices worth calling out:

- **`bootstrap.memory_lock=true`** + `ulimits.memlock: -1` pins ElasticSearch JVM memory into RAM so it can't be swapped out. ES strongly discourages swapping (latency spikes); locking memory is the cleanest fix.
- **`ES_JAVA_OPTS=-Xms2g -Xmx2g`** sets both min and max heap to 2 GB. Min == Max is best practice for the JVM. Any real log workload needs 2 GB+ to avoid hitting the parent circuit breaker.
- **`xpack.security.http.ssl.enabled=false`** keeps the HTTP API on plain HTTP. The private LAN is trusted in this lab, and 9200 is never publicly exposed. In a production cluster (or anywhere outside a trusted network), enable HTTP TLS.
- **Two `ports` lines** bind the same container port to two distinct host addresses: the private LAN IP and 127.0.0.1. This makes 9200 reachable to Logstash workers (over the private LAN), and to Kibana / local curl (over localhost), but nothing else on the public internet sees it.

### Start it

```bash
cd /opt/observability-logs
sudo docker compose up -d elasticsearch
```

The first start pulls the ~1 GB image and warms up the cluster: give it ~60 seconds.

```bash
sudo docker compose logs -f elasticsearch
# ... [INFO ][o.e.n.Node] [elasticsearch] started
```

### Verify

```bash
ELASTIC=$(sudo grep '^ELASTIC_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)

# Cluster health — expect "yellow" (single-node, replicas can't be allocated)
curl -s -u "elastic:$ELASTIC" http://localhost:9200/_cluster/health | python3 -m json.tool
```

Expected:

```json
{
    "cluster_name": "docker-cluster",
    "status": "yellow",
    "number_of_nodes": 1,
    "number_of_data_nodes": 1,
    ...
}
```

> [!INFO]
> **Yellow is fine here.** It means primary shards are allocated but replicas can't be (single-node can't host replicas of its own data: that would defeat the point).

Auth sanity check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -u "elastic:wrong" http://localhost:9200/
# 401

curl -s -o /dev/null -w "%{http_code}\n" -u "elastic:$ELASTIC" http://localhost:9200/
# 200
```

### ILM policy + index template

Logstash will write to daily indices `logs-YYYY.MM.dd`. 

Without lifecycle management those indices accumulate forever and eventually fill the disk or hit the cluster shard limit. 

Set up an ILM policy that deletes indices older than 14 days, and an index template that applies it to every `logs-*`:

```bash
ELASTIC=$(sudo grep '^ELASTIC_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)

# ILM policy: keep 14 days, then delete
curl -sX PUT -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_ilm/policy/logs_policy \
  -d '{
    "policy": {
      "phases": {
        "hot": {
          "actions": {
            "rollover": { "max_age": "1d", "max_size": "10gb" }
          }
        },
        "delete": {
          "min_age": "14d",
          "actions": { "delete": {} }
        }
      }
    }
  }' && echo

# Index template — applies the policy to all logs-* indices
curl -sX PUT -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_index_template/logs_template \
  -d '{
    "index_patterns": ["logs-*"],
    "template": {
      "settings": {
        "index.lifecycle.name": "logs_policy",
        "number_of_shards": 1,
        "number_of_replicas": 0
      }
    },
    "priority": 500
  }' && echo
```


## Where to go next

- [[observability/logs/kibana|kibana]]: **next in this series**: the web UI.

- [[observability/logs/logstash/logstash-setup|logstash-setup]]: the worker pool that will write events into ES from the private LAN.