---
title: Logstash — Setup
---

This page is a complete, self-contained reference to Logstash — what it is, what each part of a pipeline does, the knobs you'll actually turn, and the pitfalls that bite first-timers. The **final section** ("In this lab") shows the exact config running on `logstash01` and `logstash02` in this deployment, with line-by-line commentary.

## 1. What is Logstash?

Logstash is a data-collection pipeline engine, written in JRuby on the JVM. You feed it events from one or more **inputs**, optionally transform them through **filters**, and ship the result out through one or more **outputs**. Every event is a JSON-shaped document with arbitrary fields, plus a few metadata fields (`@timestamp`, `@version`, `host`, etc.).

Logstash is **stateful per pipeline**, **multi-threaded**, and **batch-oriented**: it pulls events from its inputs in batches (default 125), runs them through the filter chain in parallel worker threads, and then ships them out. Throughput is roughly `batch_size × pipeline.workers × filters_efficiency`, capped by the slowest output.

## 2. Core concepts

### 2.1 Inputs

The most common input plugins:

| Plugin     | What it does                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `beats`    | Accepts events pushed by Filebeat / Winlogbeat / Metricbeat over the Lumberjack protocol on port 5044.        |
| `syslog`   | Listens on UDP/TCP 514 for RFC3164 / RFC5424 syslog messages.                                                 |
| `tcp` / `udp` | Generic socket listener — useful for custom log shippers or app-level sinks.                              |
| `file`     | Tails files locally (mostly for testing or for single-host setups).                                          |
| `kafka`    | Pulls from a Kafka topic. Standard pattern when you want a durable buffer in front of Logstash.              |
| `http`     | HTTP endpoint that accepts POST'd events. Handy for webhook ingestion.                                       |

### 2.2 Filters

Where the real work happens. The big ones:

| Plugin     | What it does                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `grok`     | Pattern-matches a string field against a regex-with-named-captures DSL. The canonical tool for unstructured logs.    |
| `dissect`  | Faster than grok for **fixed-position** parsing — no regex backtracking, just delimiter splitting.                 |
| `json`     | Parse a field that contains a JSON string into structured nested fields.                                           |
| `mutate`   | Rename, convert types, lowercase/uppercase, gsub, split, strip, remove.                                            |
| `date`     | Parse a string timestamp into the canonical `@timestamp` field. Critical — without this, ES indexes by ingest time. |
| `geoip`    | Look up an IP address in a MaxMind DB and add `country`, `city`, `lat`, `lon` fields.                              |
| `kv`       | Parse `key1=val1 key2=val2` style fields.                                                                          |
| `useragent` | Parse a User-Agent string into `os`, `browser`, `device` fields.                                                  |

Filters can be wrapped in `if` / `else if` blocks to route conditionally:

```ruby
filter {
  if [type] == "nginx-access" {
    grok { match => { "message" => "%{COMBINEDAPACHELOG}" } }
  } else if [type] == "journald" {
    # already structured, skip parsing
  }
}
```

### 2.3 Outputs

| Plugin           | What it does                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `elasticsearch`  | The canonical destination. Bulk-writes events into an index pattern of your choice.        |
| `kafka`          | Publish to a Kafka topic. Used for fan-out to multiple downstream consumers.               |
| `file`           | Append events to a local file. Useful for archival or debugging.                            |
| `stdout`         | Print events to stdout. Indispensable while developing a pipeline (`codec => rubydebug`).  |
| `dead_letter_queue` | Implicit sink for events the main output couldn't accept (see §4).                       |

### 2.4 Performance knobs

In `config/logstash.yml`:

- `pipeline.workers: <N>` — number of worker threads per pipeline. Default: number of CPU cores. Each worker pulls a batch and runs it through the filter chain in isolation.
- `pipeline.batch.size: 125` — events per batch. Larger batches improve throughput but increase end-to-end latency.
- `pipeline.batch.delay: 50` — max ms to wait for a batch to fill before flushing. Smaller = lower latency, more overhead.
- `queue.type: memory | persisted` — in-memory (default, fast, lossy on crash) or on-disk (durable, slightly slower).
- `queue.max_bytes: 1gb` — only relevant for `persisted` queues.

### 2.5 Dead Letter Queue (DLQ)

When Elasticsearch rejects an event (mapping conflict, malformed JSON, too-big document), the default behavior is to log a warning and drop it. Enable the DLQ to capture those events on disk for later inspection:

```yaml
# config/logstash.yml
dead_letter_queue.enable: true
dead_letter_queue.max_bytes: 1024mb
```

Events in the DLQ can be replayed once you've fixed the mapping. Highly recommended in production.

## 3. Common patterns

- **Filebeat (push) → Logstash (parse) → Elasticsearch**: the canonical ELK flow.
- **Multiple shippers behind a load balancer → Logstash pool → ES**: the production-grade variant. Lets you roll Logstash, absorb spikes.
- **Kafka in front of Logstash**: when you have so many events that a momentary ES outage would overwhelm Logstash's memory queue. Kafka buffers for hours / days.
- **Two-stage Logstash**: a first cheap-and-fast stage that just routes (`if/else if`), a second stage per category that does heavy parsing. Reduces grok contention.

## 4. Pitfalls

> [!WARNING]
> **`@timestamp` defaults to ingest time, not event time.** If you don't have a `date {}` filter parsing the actual log timestamp, every event lands with `@timestamp = now()`, and Kibana's time filters will lie to you.

> [!WARNING]
> **Grok is fast — until it isn't.** Backtracking on misaligned patterns can blow the CPU. Always pin patterns with anchors (`^...$`), prefer `dissect` when fields are fixed-position, and benchmark with the Kibana Grok Debugger.

> [!IMPORTANT]
> **Mapping conflicts are the #1 silent failure.** The first event that writes a field pins its type forever in that index. If event #2 has the same field name but a different type (string vs number), it gets rejected. Either use **typed grok captures** (`%{NUMBER:port:int}`) or use **rollover-per-day indices** so a bad field only contaminates one day.

> [!INFO]
> **Logstash is slow to start.** ~45–60 s on a small VM is normal. Healthchecks should be patient (`interval: 30s`, `retries: 5+`), otherwise Docker keeps restarting it before it has a chance to come up.

## 5. In this lab

Two identical workers, one per VM (`logstash01` and `logstash02`), each on its own Tailscale-only IP. Both write to the same Elasticsearch on the VPS, using a **least-privilege** ES user (`logstash_writer`) created specifically for this purpose. The Beats input on `:5044` will be reached by Filebeat through the HAProxy VIP once the load-balancer layer is deployed; until then, Filebeat can target either worker directly.

### 5.1 Prerequisites on each VM

- Ubuntu 24.04 VM, joined to the Tailscale tailnet.
- Docker CE installed (same recipe as in [[observability/logs/elasticsearch/elasticsearch-setup#Prerequisites|elasticsearch-setup]]).
- Network reachability from the VM to the VPS Tailscale IP (`100.114.84.48:9200`).

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

The pipeline itself — Beats in, Elasticsearch out. No filters yet; grok for nginx and journald lands in Phase 6.

```ruby
# /opt/observability-logs/pipeline/main.conf
input {
  beats {
    port => 5044
  }
}

filter {
  # Phase 6 will add grok for nginx access logs + journald passthrough
}

output {
  elasticsearch {
    hosts    => [ "http://100.114.84.48:9200" ]
    user     => "logstash_writer"
    password => "${LOGSTASH_WRITER_PASSWORD}"
    index    => "logs-%{+YYYY.MM.dd}"
  }
}
```

A couple of details:

- **`${LOGSTASH_WRITER_PASSWORD}`** is interpolated by Logstash at startup from its environment. The variable will be injected into the container by docker-compose (next section).
- **Daily indices** (`logs-%{+YYYY.MM.dd}`) — easy to roll, easy to delete with ILM later. One day per index means a mapping conflict is contained to a single day.
- **No TLS** on the ES output: all traffic stays inside Tailscale's WireGuard mesh.

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
      - "5044:5044"        # Beats input — HAProxy VIP reaches here in Phase 5
      - "9600:9600"        # Monitoring API — over Tailscale only, not publicly exposed
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9600 || exit 1"]
      interval: 30s
      retries: 5
```

> [!WARNING]
> **Never hardcode the password in `docker-compose.yml`.** Special characters trigger bash history expansion and docker-compose's own variable substitution, both of which silently mangle the value. Always reference it via `${VAR}` and keep the actual value in a `.env` written with a single-quoted heredoc.

### 5.8 Start it

```bash
cd /opt/observability-logs
sudo docker compose up -d

# Wait ~60s for Logstash to come up, then tail the logs
sudo docker compose logs -f logstash
```

Look for:

```
[INFO ][logstash.outputs.elasticsearch] Restored connection to ES instance {:url=>"http://logstash_writer:xxxxxx@100.114.84.48:9200/"}
[INFO ][logstash.javapipeline ][main] Pipeline started {"pipeline.id"=>"main"}
[INFO ][logstash.agent          ] Successfully started Logstash API endpoint {:port=>9600, :ssl_enabled=>false}
```

If you see `Got response code '401' contacting Elasticsearch`, the password in `.env` doesn't match the one in ES — re-check it from the VPS `.env`.

### 5.9 Sanity check from the VPS

After both workers are up, send a test event from the VPS through one of them and check that ES received it:

```bash
# Quick TCP event via netcat — Beats protocol won't work but a raw line lands in
# Logstash's logs if we temporarily add a tcp input. For a real end-to-end test,
# use Filebeat (see filebeat-setup, once that's deployed).
```

For now, the cleanest end-to-end test is to watch the indices in ES once Filebeat is configured to ship to a worker.

### 5.10 Repeat on logstash02

Steps **5.3 → 5.8** are identical on the second VM. Same image, same `.env` (same password, same role), same pipeline, same ports. The point of running two is horizontal capacity and fault isolation — they're peers, not primary/secondary.

## 6. Where to go next

- [[observability/logs/elasticsearch/elasticsearch-setup|elasticsearch-setup]] — the ES instance these workers write to.
- [[observability/logs/kibana/kibana-setup|kibana-setup]] — UI on top of the data Logstash indexes.

Coming up next in the deploy:

- **Filebeat** on the VPS — the producer that will push events into these workers. (`filebeat-setup`, Phase 4.)
- **HAProxy + Keepalived** on `lb01` / `lb02` — the HA load-balancer pair that fronts these workers. (`haproxy-for-logs`, `keepalived-vrrp`, Phase 5.)
- **Grok parsing** for nginx access logs + journald — added to the empty `filter {}` block above. (Phase 6.)