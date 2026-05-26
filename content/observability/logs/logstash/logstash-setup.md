---
title: Logstash — Setup
---


## 5. In this lab

Two identical workers, one per VM (`logstash01` at `10.0.0.21` and `logstash02` at `10.0.0.22`), each on the private LAN. Both write to the same Elasticsearch on the VPS (`10.0.0.5:9200`), using a **least-privilege** ES user (`logstash_writer`) created specifically for this purpose. The Beats input on `:5044` is reached by Filebeat through the HAProxy VIP at `10.0.0.10` (see [[networking/miscellaneous/haproxy|haproxy]] and [[networking/miscellaneous/keepalived-vrrp|keepalived-vrrp]]).

### 5.1 Prerequisites on each VM

- Ubuntu 24.04 VM on the private network.
- Docker CE installed (same recipe as in [[observability/logs/elasticsearch/elasticsearch-setup#Prerequisites|elasticsearch-setup]]).
- Network reachability from the VM to the VPS at `10.0.0.5:9200`.

### 5.2 Generate the `logstash_writer` password (on the VPS)

The workers don't need ES superuser. We'll create a dedicated `logstash_writer` user, with a role scoped to writing into our log indices and nothing else. First, generate the password on the VPS and append it to the central `.env`:

```bash
# On the VPS, /opt/observability-logs/
echo "LOGSTASH_WRITER=$(openssl rand -hex 24)"

sudo tee -a /opt/observability-logs/.env > /dev/null <<'EOF'
LOGSTASH_WRITER_PASSWORD=<paste hex value here>
EOF
```

### 5.3 Create the ES role and user (once, from the VPS)

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

> [!TIP]
> The `monitor` cluster privilege is enough for Logstash to ask ES for version info, template state, ILM policies. Don't grant `all` or `superuser` to a worker — every extra privilege is a future blast-radius problem.

### 5.4 `.env` — credentials only

On each worker VM, paste the `logstash_writer` password (taken from the VPS `.env`) into a local `.env` using a quoted heredoc so bash doesn't expand anything:

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

### 5.5 `config/logstash.yml`

```yaml
# /opt/observability-logs/config/logstash.yml
http.host: "0.0.0.0"
pipeline.workers: 2
pipeline.batch.size: 125
pipeline.batch.delay: 50
```

`http.host: 0.0.0.0` is required so the monitoring API on `:9600` is reachable from outside the container (used by the healthcheck and by future Prometheus scraping).

### 5.6 `pipeline/main.conf`

The pipeline itself — Beats in, Elasticsearch out.

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
- **`client_inactivity_timeout => 3600`**: the Beats input closes idle TCP connections after this many seconds. The default (60s) is too aggressive for long-lived Filebeat connections that may sit idle between batches; 1h is a safer upper bound.
- **Daily indices** (`logs-%{+YYYY.MM.dd}`) — easy to roll, easy to delete with ILM. One day per index means a mapping conflict is contained to a single day.

### 5.7 `docker-compose.yml`

```yaml
services:
  logstash:
    image: docker.elastic.co/logstash/logstash:8.15.0
    container_name: logstash
    user: "1000:1000"
    environment:
      LS_JAVA_OPTS: "-Xms1g -Xmx1g"
      # Passed through from the local .env so pipeline/main.conf can use ${LOGSTASH_WRITER_PASSWORD}
      LOGSTASH_WRITER_PASSWORD: "${LOGSTASH_WRITER_PASSWORD}"
    volumes:
      - /opt/observability-logs/pipeline:/usr/share/logstash/pipeline:ro
      - /opt/observability-logs/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
      - /opt/observability-logs/data:/usr/share/logstash/data
    ports:
      - "5044:5044"        # Beats input — reached by HAProxy from the VIP
      - "9600:9600"        # Monitoring API — private network only
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9600 || exit 1"]
      interval: 30s
      retries: 5
```

> [!WARNING]
> **Never hardcode the password in `docker-compose.yml`.** Special characters trigger bash history expansion and docker-compose's own variable substitution, both of which silently mangle the value. Always reference it via `${VAR}` and keep the actual value in a `.env` written with a single-quoted heredoc.

> [!IMPORTANT]
> Keep the `pipeline/` directory containing **only the pipeline file you intend to load**. Backup copies (`main.conf.bak`) placed in the same folder will be loaded as additional pipelines and cause `Address already in use` on port 5044. Store backups outside this directory.

### 5.8 Start it

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

If you see `Got response code '401' contacting Elasticsearch`, the password in `.env` doesn't match the one in ES — re-check it from the VPS `.env`.

### 5.9 Repeat on logstash02

Steps **5.4 → 5.8** are identical on the second VM. Same image, same `.env` (same password), same pipeline, same ports. The point of running two is horizontal capacity and fault isolation — they're peers, not primary/secondary.

## 6. Where to go next

- [[networking/miscellaneous/haproxy|haproxy]] — **next in this series**: the load balancer that will be deployed in front of these workers.

- [[observability/logs/filebeat/filebeat-setup|filebeat-setup]] — coming later in the series: the producer that will push events through HAProxy into these workers.

Back-references (already covered earlier in the series): [[observability/logs/elasticsearch/elasticsearch-setup|elasticsearch-setup]] is the ES instance these workers write to; [[observability/logs/kibana/kibana-setup|kibana-setup]] is the UI on top of it.