---
title: Logstash — Setup
---
Read [[observability/logs/logstash/_index|this Logstash overview]] for a quick theory lesson.

## Overview

This page covers the **base deploy** of the Logstash worker pool: two identical Docker containers, one per dedicated VM on the private LAN (`logstash01` at `10.0.0.21`, `logstash02` at `10.0.0.22`), each running the same pipeline and writing to the central Elasticsearch on the VPS.

Of course you don't really need to use two Logstash workers for a simple stack (and maybe you don't even need Logstash, just: Filebeat -> ElasticSearch -> Kibana), but here I want to show a enterprise-like architecture that can be scaled horizontally.

Both workers are **peers**, not primary/secondary: the point of running two is horizontal capacity, and fault isolation.

They'll later sit behind the HAProxy + Keepalived VIP at `10.0.0.10:5044`, so the producer (Filebeat) only ever talks to one highly-available endpoint.

Logstash authenticates to Elasticsearch with a least-privilege user (`logstash_writer`) created specifically for this purpose: a compromised worker can append to `logs-*` and nothing else.

This is what will be exposed, and to whom:

| Address                                          | Reached from                   | Behind auth?                |
| ------------------------------------------------ | ------------------------------ | --------------------------- |
| `10.0.0.21:5044` / `10.0.0.22:5044` (Beats in)   | HAProxy LBs on the private LAN | No (plain TCP, trusted LAN) |
| `10.0.0.21:9600` / `10.0.0.22:9600` (monitoring) | Same private LAN               | No (read-only API)          |
| Public internet                                  | nothing                        | n/a                         |

## Installation
### 1. Prerequisites on each VM

- Ubuntu 24.04 VM on the private network.
- Docker CE installed (same recipe as in [[observability/logs/elasticsearch/elasticsearch-setup#Prerequisites|elasticsearch-setup]]).
- Network reachability from the VM to the VPS at `10.0.0.5:9200`.

### 2. Generate the `logstash_writer` password on the VPS

The workers don't need ES superuser. 

We'll create a dedicated `logstash_writer` user, with a role scoped to writing into our log indices and nothing else. 

First, generate the password on the VPS, and append it to the central `.env`:

```bash
# On the VPS, /opt/observability-logs/
echo "LOGSTASH_WRITER=$(openssl rand -hex 24)"

sudo tee -a /opt/observability-logs/.env > /dev/null <<'EOF'
LOGSTASH_WRITER_PASSWORD=<paste hex value here>
EOF
```

### 3. Create the ES role and user (on the VPS)

```bash
cd /opt/observability-logs
ELASTIC=$(grep '^ELASTIC_PASSWORD=' .env | cut -d= -f2-)
LSW=$(grep '^LOGSTASH_WRITER_PASSWORD=' .env | cut -d= -f2-)

# Role: write to logs indices + minimal cluster operations needed for templates/ILM
curl -sX PUT -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_security/role/logstash_writer \
  -d '{
    "cluster": ["monitor", "manage_index_templates", "manage_ilm"],
    "indices": [{
      "names": ["filebeat-*", "logstash-*", "logs-*"],
      "privileges": ["write", "create", "create_index", "manage",
                     "view_index_metadata", "auto_configure"]
    }]
  }' && echo

# User: the workers will authenticate with this
curl -sX PUT -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_security/user/logstash_writer \
  -d "{
    \"password\": \"$LSW\",
    \"roles\": [\"logstash_writer\"],
    \"full_name\": \"Logstash worker writer\"
  }" && echo
```

Verify:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -u "logstash_writer:$LSW" http://localhost:9200/_cluster/health
# HTTP 200
```

### 4. Create a `.env` file on each worker

On each worker VM, paste the `logstash_writer` password (taken from the VPS `.env`) into a local `.env` using EOF, so bash doesn't expand anything:

```bash
cat > /opt/observability-logs/.env <<'EOF'
LOGSTASH_WRITER_PASSWORD=<paste hex value from VPS .env here>
EOF
chmod 600 /opt/observability-logs/.env
```

Verify the length (must be 48 hex chars):

```bash
PW=$(grep '^LOGSTASH_WRITER_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)
echo "Length: ${#PW}"
# Length: 48
```

### 5. `config/logstash.yml`

```yaml
# /opt/observability-logs/config/logstash.yml
http.host: "0.0.0.0"
pipeline.workers: 2
pipeline.batch.size: 125
pipeline.batch.delay: 50
```

`http.host: 0.0.0.0` is required so the monitoring API on `:9600` is reachable from outside the container (used by the healthcheck and by future Prometheus scraping).

### 6. `pipeline/main.conf`

The Logstash pipeline itself.

Super simple: Beats in, Elasticsearch out.

```ruby
# /opt/observability-logs/pipeline/main.conf
input {
  beats {
    port => 5044
    client_inactivity_timeout => 3600
  }
}

filter {
  # Per-event parsing / enrichment goes here. Keep empty for the first
  # end-to-end test; add grok / mutate / date filters once the pipeline
  # is verified working with raw events.
}

output {
  elasticsearch {
    hosts    => [ "http://10.0.0.5:9200" ]
    user     => "logstash_writer"
    password => "${LOGSTASH_WRITER_PASSWORD}"
    index    => "logs-%{+YYYY.MM.dd}"
  }
}
```

A couple of details:

- **`${LOGSTASH_WRITER_PASSWORD}`** is interpolated by Logstash at startup from its environment. The variable will be injected into the container by docker-compose (next section).
- **`client_inactivity_timeout => 3600`**: the Beats input closes idle TCP connections after this many seconds. The default (60s) is too aggressive for long-lived Filebeat connections that may sit idle between batches: 1h is a safer upper bound.
- **Daily indices** (`logs-%{+YYYY.MM.dd}`): easy to roll, easy to delete with ILM. One day per index means a mapping conflict is contained to a single day.

### 7. `docker-compose.yml`

> [!example]- Example: my docker-compose (logstash service)
> ```yaml
> services:
>   logstash:
>     image: docker.elastic.co/logstash/logstash:8.15.0
>     container_name: logstash
>     user: "1000:1000"
>     environment:
>       LS_JAVA_OPTS: "-Xms1g -Xmx1g"
>       # Passed through from the local .env so pipeline/main.conf can use ${LOGSTASH_WRITER_PASSWORD}
>       LOGSTASH_WRITER_PASSWORD: "${LOGSTASH_WRITER_PASSWORD}"
>     volumes:
>       - /opt/observability-logs/pipeline:/usr/share/logstash/pipeline:ro
>       - /opt/observability-logs/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
>       - /opt/observability-logs/data:/usr/share/logstash/data
>     ports:
>       - "5044:5044"        # Beats input — reached by HAProxy from the VIP
>       - "9600:9600"        # Monitoring API — private network only
>     restart: unless-stopped
>     healthcheck:
>       test: ["CMD-SHELL", "curl -fsS http://localhost:9600 || exit 1"]
>       interval: 30s
>       retries: 5
> ```

> [!IMPORTANT]
> Keep the `pipeline/` directory containing **only the pipeline file you intend to load**. 
> 
> Backup copies (`main.conf.bak`) placed in the same folder will be loaded as additional pipelines and cause `Address already in use` on port 5044. Store backups outside this directory.

### 8. Start it

```bash
cd /opt/observability-logs
sudo docker compose up -d

# Wait ~60s for Logstash to come up, then tail the logs
sudo docker compose logs -f logstash
```

Look for:

```
[INFO ][logstash.outputs.elasticsearch] Restored connection to ES instance {:url=>"http://logstash_writer:xxxxxx@10.0.0.5:9200/"}
[INFO ][logstash.javapipeline ][main] Pipeline started {"pipeline.id"=>"main"}
[INFO ][logstash.agent          ] Successfully started Logstash API endpoint {:port=>9600, :ssl_enabled=>false}
```

If you see `Got response code '401' contacting Elasticsearch`, the password in `.env` doesn't match the one in ES: re-check it from the VPS `.env`.

### 9. Repeat on logstash02

Steps are identical on the second VM. 

Same image, same `.env` (same password), same pipeline, same ports.

## Where to go next

- [[networking/miscellaneous/haproxy|haproxy]]: the load balancer that will be deployed in front of these workers.

- [[observability/logs/filebeat/filebeat-setup|Filebeat]] (coming later in the series): the producer that will push events through HAProxy into these workers.
