---
title: Elasticsearch — Setup
---

This page walks through deploying Elasticsearch 8.15 in a single-node Docker container on the VPS, with X-Pack security enabled and persistent storage on a bind-mounted volume. The cluster is exposed on `127.0.0.1:9200` (for local services like Kibana) and on the Tailscale IP `100.114.84.48:9200` (for Logstash workers running on private VMs). No public exposure.

## Prerequisites

- Docker CE installed via the official method (the `apt install docker.io` shortcut ships an older fork and can cause surprises with `docker compose` v2):

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
- Tailscale already configured on the VPS, reachable at a known Tailscale IP (e.g. `100.114.84.48`).

## Kernel setting — `vm.max_map_count`

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

## Directory layout

```bash
sudo mkdir -p /opt/observability-logs/es-data
sudo chown -R 1000:1000 /opt/observability-logs/es-data
cd /opt/observability-logs
```

UID 1000 matches the `elasticsearch` user inside the official image — without this, the container can't write to the bind-mounted data directory.

## Generate the `elastic` superuser password

> [!WARNING]
> Use **hex-only** passwords. Special characters like `!` and `$` are interpreted by bash (history expansion) and docker-compose (variable expansion) in ways that silently truncate or mangle the value, and the symptoms only show up later as authentication failures. `openssl rand -hex 24` gives 48 hex chars — enough entropy, zero metacharacter traps.

```bash
echo "ELASTIC=$(openssl rand -hex 24)"
```

Copy the hex value into your password manager **now**, then write it into the `.env` using a single-quoted heredoc (the quotes around `'EOF'` stop bash from interpreting anything inside):

```bash
sudo tee /opt/observability-logs/.env > /dev/null <<'EOF'
ELASTIC_PASSWORD=<paste hex value here>
EOF
sudo chmod 600 /opt/observability-logs/.env
```

> [!INFO]
> Other services (Kibana, Logstash, the anonymous viewer) will need their own credentials too. Each of their setup pages appends to this same `.env` file when the time comes — generate them in context, not all up front.

## docker-compose.yml — Elasticsearch service

Create `/opt/observability-logs/docker-compose.yml`:

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    container_name: elasticsearch
    user: "1000:1000"
    environment:
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
      - bootstrap.memory_lock=true
      # Security ON, but TLS OFF on the HTTP layer.
      # Lab simplification: traffic stays on Tailscale, which already encrypts.
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
      # Tailscale IP — for Logstash workers on private VMs
      - "100.114.84.48:9200:9200"
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

- **`bootstrap.memory_lock=true`** + `ulimits.memlock: -1` pins ES JVM memory into RAM so it can't be swapped out. ES strongly discourages swapping (latency spikes); locking memory is the cleanest fix.
- **`ES_JAVA_OPTS=-Xms1g -Xmx1g`** sets both min and max heap to 1 GB. Min == Max is best practice for the JVM — no GC-time resizing. 1 GB is comfortable for a single-node lab.
- **`xpack.security.http.ssl.enabled=false`** keeps the HTTP API on plain HTTP. Tailscale's WireGuard encrypts the transport between hosts already, and we never expose 9200 publicly. In a production cluster (or anywhere outside a private mesh), enable HTTP TLS.
- **Two `ports` lines** bind the same container port to two distinct host addresses — Tailscale IP and 127.0.0.1. This makes 9200 reachable to Logstash workers (over Tailscale) and Kibana / local curl (over localhost), but nothing else on the public internet sees it.

## Start it

```bash
cd /opt/observability-logs
sudo docker compose up -d elasticsearch
```

The first start pulls the ~1 GB image and warms up the cluster — give it ~60 seconds.

```bash
sudo docker compose logs -f elasticsearch
# ... [INFO ][o.e.n.Node] [elasticsearch] started
```

## Verify

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
> **Yellow is fine here.** It means primary shards are allocated but replicas can't be (single-node can't host replicas of its own data — that would defeat the point). On a real cluster you'd see green; on a single-node lab, yellow is the steady state.

Auth sanity check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -u "elastic:wrong" http://localhost:9200/
# 401

curl -s -o /dev/null -w "%{http_code}\n" -u "elastic:$ELASTIC" http://localhost:9200/
# 200
```

## What's exposed and to whom

| Address                  | Reached from                            | Purpose                            |
| ------------------------ | --------------------------------------- | ---------------------------------- |
| `127.0.0.1:9200`         | Same host (Kibana, local curl, etc.)    | Local services on the VPS          |
| `100.114.84.48:9200`     | Other Tailscale peers (logstash01/02)   | Log workers writing to ES          |
| Public internet          | nothing                                 | ES is never publicly addressable   |

## Where to go next

- [[observability/logs/kibana/kibana-setup|kibana-setup]] — UI on top of this ES, exposed publicly at `/logs/`.
- [[observability/logs/logstash/logstash-setup|logstash-setup]] — the Logstash workers that write to this ES from the Tailscale side.