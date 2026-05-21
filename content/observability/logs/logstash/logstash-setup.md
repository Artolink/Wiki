---
title: Logstash setup
---

## What is Logstash

**Logstash** is the "L" of the ELK stack: a server-side event-processing engine that **ingests events from many sources, transforms them, and ships them to a destination**. Think of it as a programmable ETL pipeline specialised for log/event data.

Where Filebeat is intentionally light (read a file, ship a line, almost no logic), Logstash is **heavy**: it runs on the JVM, supports hundreds of plugins, and exists precisely to do the work Filebeat refuses to do — parsing, enriching, conditional routing, multi-destination output.

Typical responsibilities of Logstash:
- **Parse** unstructured log lines (e.g. nginx access logs) into structured fields (status, response_time, client_ip, …).
- **Enrich** events (GeoIP lookup from an IP, hostname resolution, tag based on patterns).
- **Filter** unwanted events (drop noisy debug-level lines from one service).
- **Route** to multiple destinations (e.g. errors also go to a separate index or to Slack).
- **Convert** between formats (CSV → JSON, syslog → ECS, …).

Logstash is **stateful at the connection level** (it buffers events in memory or on disk) but **stateless at the event level** (every event is independent: no joins across events natively). For correlated events you need an upstream of Logstash (Kafka with stream processing) or you do it downstream (Elasticsearch aggregations).

## Core concepts

### The pipeline: input → filter → output

A Logstash configuration is one or more **pipelines**. Each pipeline has three stages, in order:

```
inputs           filters            outputs
   │                │                  │
[source(s)] ──> [transformations] ──> [destination(s)]
```

Each stage uses **plugins**. The input plugin receives events; filter plugins mutate them; output plugins deliver them. Plugins are configurable via blocks in a Logstash config file.

A minimal pipeline that takes beats events, adds a tag, and ships to Elasticsearch:

```logstash
input {
    beats {
        port => 5044
    }
}

filter {
    mutate {
        add_tag => [ "ingested-by-logstash" ]
    }
}

output {
    elasticsearch {
        hosts => [ "http://elasticsearch.example.com:9200" ]
        index => "logs-%{+YYYY.MM.dd}"
    }
}
```

### The event

Inside Logstash, every log line becomes an **event**: a structured object with named fields. The Beats input automatically populates `@timestamp`, `host`, `message`, `agent.*`, etc. Filters add or modify fields; the output plugin serialises the final event for the destination (JSON for Elasticsearch, plaintext for `file`, etc.).

You access fields with the `%{fieldname}` syntax in plugin configurations, and with `[fieldname]` in `if` conditions.

### Codecs

A **codec** is a plugin that runs at the boundary of an input or output to decode/encode the byte stream. Defaults usually do the right thing: the `json` codec on the input parses incoming JSON into fields; `plain` on the output writes plain text.

## Common patterns

### Input plugins

| Plugin     | Receives from                                                          |
| ---------- | ---------------------------------------------------------------------- |
| `beats`    | Filebeat, Metricbeat, etc. — the canonical input.                      |
| `syslog`   | RFC 3164/5424 syslog over UDP or TCP. For appliances and legacy hosts. |
| `tcp`      | Raw TCP socket. Pair with a codec to parse the payload.                |
| `file`     | Tails a local file. Used when Logstash itself sits on the source host. |
| `kafka`    | A Kafka topic. Standard in production for backpressure.                |
| `http`     | An HTTP endpoint. Webhook receivers.                                   |
| `stdin`    | For testing / one-shot pipelines from the CLI.                         |

### Filter plugins (the brain)

| Plugin        | What it does                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `grok`        | Regex-based pattern matching to extract fields from unstructured text. Powerful, slow on complex patterns.                    |
| `dissect`     | Positional, faster alternative to grok when the input has a fixed structure (delimiter-based, not free text).                 |
| `mutate`      | Catch-all for field manipulation: rename, gsub, lowercase, convert types, add/remove tags or fields.                          |
| `date`        | Parse a timestamp string out of a field into `@timestamp`. Without this, ES uses ingestion time, not event time.              |
| `geoip`       | Look up an IP and add country/city/lat/lon fields. Useful for nginx access logs.                                              |
| `json`        | Decode a JSON string field into structured nested fields.                                                                     |
| `kv`          | Parse "key=value key=value" strings into fields. Common in legacy app logs.                                                   |
| `drop`        | Discard the event entirely. Used in `if` blocks to filter noise.                                                              |
| `ruby`        | Run arbitrary Ruby code. Escape hatch when no plugin does what you need. Use sparingly: hard to maintain.                     |

### Conditionals

Filter and output blocks support `if/else if/else`, matching on event fields:

```logstash
filter {
    if [log][file][path] =~ /nginx/ {
        grok { match => { "message" => "%{COMBINEDAPACHELOG}" } }
        geoip { source => "clientip" }
        date { match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ] }
    } else if [systemd][unit] {
        # journald event — already structured by Filebeat
        mutate { add_tag => [ "systemd" ] }
    } else {
        # everything else: leave alone
        mutate { add_tag => [ "raw" ] }
    }
}
```

### Output plugins

| Plugin           | Sends to                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `elasticsearch`  | The canonical destination. ILM-aware, index template-aware.       |
| `kafka`          | A Kafka topic. For downstream fan-out or further processing.      |
| `file`           | A local file. Backup, audit, or pre-Elasticsearch staging.        |
| `stdout`         | The console. Indispensable for debugging — use the `rubydebug` codec to see events as JSON. |
| `email`/`slack`  | Notifications. Pair with `if [tags] == "alert"` style routing.   |

### Performance knobs

| Setting                  | What it does                                                                              | Sensible default                |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `pipeline.workers`       | Threads processing filter+output. Default: CPU count.                                     | Leave default unless tuning.    |
| `pipeline.batch.size`    | Events bundled into one filter+output cycle. Larger = better throughput, more memory.     | 125 (default) ok for most cases. |
| `pipeline.batch.delay`   | Max wait (ms) before flushing a partial batch.                                            | 50ms.                            |
| `queue.type`             | `memory` (fast, lost on crash) or `persisted` (disk, survives crash).                     | `persisted` in production.      |
| `queue.max_bytes`        | Disk cap for the persistent queue.                                                        | 1024mb (1GB).                   |
| JVM heap (`Xms` / `Xmx`) | Set both to the same value, e.g. `-Xms2g -Xmx2g`. Don't exceed 50% of host RAM.           | Start with 2 GB, monitor.       |

### Dead-letter queue (DLQ)

If an event fails to be delivered to the output (e.g. Elasticsearch rejects it because of a mapping conflict), by default Logstash retries forever, blocking the pipeline. Enable the DLQ in `logstash.yml`:

```yaml
dead_letter_queue.enable: true
path.dead_letter_queue: /usr/share/logstash/dlq
```

Now failed events go to the DLQ instead of blocking. You can later replay or inspect them with the `dead_letter_queue` input plugin.

## Pitfalls

> [!WARNING] Things that will bite you
> - **Grok is regex**: every grok pattern compiles to a regex, and regex backtracking can explode. A pattern that takes 50ms on simple input can take 5s on a malicious one. Use `dissect` if the data is delimiter-based; profile your grok with `logstash --node.name test --pipeline.workers 1` and watch CPU.
> - **`date` filter is not optional**: without it, `@timestamp` is the ingestion time. When you replay old logs or backfill, every event lands "now". You then look at Discover and wonder why "yesterday's outage" doesn't show up.
> - **JVM heap = RAM trap**: Logstash is a JVM app. `Xms = Xmx`, never more than 50% of host RAM, never more than ~30 GB (above that pointer compression flips off and you actually get less usable memory).
> - **`rubydebug` codec in production**: writes every event to stdout as multi-line JSON. Useful for one minute of debug, catastrophic if left on under load (disk fills, journal explodes).
> - **Stateless = no joins**: if you need "match request log line A with response log line B", Logstash alone can't. You need an upstream Kafka with stream processing, or you join in Elasticsearch.
> - **Field naming pollution**: every typo in a field name creates a new field in the Elasticsearch mapping. After a few mistakes you have `client_IP`, `clientip`, `client.ip` all coexisting. Lock the schema with an ES index template + ECS-aligned fields.
> - **Persistent queue + small disk**: `persisted` queue is great until it fills the partition. Always set `queue.max_bytes` and monitor `/var/lib/logstash/queue` (or wherever you mounted it).

## In this lab

Two identical Logstash instances run in Docker on logstash01 and logstash02. Both listen on `:5044` for Beats input (load-balanced by HAProxy), parse a minimal set of events, and ship to Elasticsearch on the VPS over Tailscale.

### docker-compose.yml (identical on logstash01 and logstash02)

```yaml
# ~/logstash/docker-compose.yml

services:
  logstash:
    image: docker.elastic.co/logstash/logstash:8.15.0
    container_name: logstash
    user: "1000:1000"
    environment:
      LS_JAVA_OPTS: "-Xms1g -Xmx1g"
    volumes:
      - ./pipeline:/usr/share/logstash/pipeline:ro
      - ./config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
      - logstash-queue:/usr/share/logstash/data       # persistent queue + DLQ
    ports:
      - "5044:5044"        # Beats input (HAProxy forwards here)
      - "9600:9600"        # Logstash monitoring API (over Tailscale)
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9600 || exit 1"]
      interval: 30s
      retries: 3

volumes:
  logstash-queue:
```

### config/logstash.yml

```yaml
http.host: "0.0.0.0"
http.port: 9600

queue.type: persisted
queue.max_bytes: 1024mb

dead_letter_queue.enable: true
path.dead_letter_queue: /usr/share/logstash/data/dlq
```

### pipeline/main.conf — minimal first pipeline

The first iteration of the pipeline takes everything from Beats, applies a sensible `date` filter so `@timestamp` is the event's actual time, tags by source, and ships to Elasticsearch on the VPS.

```logstash
# ~/logstash/pipeline/main.conf

input {
    beats {
        port => 5044
    }
}

filter {
    # nginx access logs: parse the combined format
    if [log][file][path] =~ "/var/log/nginx/access" {
        grok {
            match => { "message" => "%{COMBINEDAPACHELOG}" }
            tag_on_failure => [ "_grok_nginx_failed" ]
        }
        date {
            match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ]
            target => "@timestamp"
        }
        mutate { add_tag => [ "nginx-access" ] }
    }

    # journald events: Filebeat already structured them, just tag
    else if [systemd] {
        mutate { add_tag => [ "systemd" ] }
    }

    # docker container logs: tag by container name
    else if [container] {
        mutate {
            add_tag => [ "docker" ]
            add_field => { "[@metadata][container_name]" => "%{[container][name]}" }
        }
    }

    # everything else: pass through
    else {
        mutate { add_tag => [ "raw" ] }
    }
}

output {
    elasticsearch {
        hosts => [ "http://vps.tailscale-domain:9200" ]
        index => "logs-%{+YYYY.MM.dd}"
        # In single-node lab mode no auth; in prod set user/password or api_key.
    }

    # Optional: also print to stdout while developing. Comment out in steady state.
    # stdout { codec => rubydebug }
}
```

### Start, verify, debug

```sh
# On logstash01 and logstash02:
docker compose up -d
docker compose logs -f logstash

# Verify the monitoring API is reachable over Tailscale:
curl http://logstash01.tailscale-domain:9600/?pretty
# Expected: JSON with "status": "green" and pipeline info.

# Once HAProxy is in front and Filebeat ships, watch events flow:
docker compose logs logstash | grep -i 'beats\|pipeline\|sending'
```

### Iteration plan

The pipeline above is the bare minimum to get events into Elasticsearch with reasonable parsing for the three biggest sources on the VPS (nginx, systemd, docker). Iteratively, you'll want to:

1. Add **GeoIP enrichment** for the `clientip` field on nginx events.
2. Add **conditional drops** for very noisy lines you don't want to index.
3. Add a **`stdout { codec => rubydebug }`** output while developing a new filter, then remove it.
4. Move to an **ECS-aligned schema** (rename fields to `event.*`, `source.*`, etc.) for consistency with the wider Elastic Stack ecosystem.

## Where to go next

- Next in the series: **[[elasticsearch/_index|Elasticsearch]]** — the store the Logstash output writes to.
- Logstash's plugin ecosystem is huge and the language has subtleties this page doesn't cover (multiline codec, persistent queue tuning, JVM GC tuning, monitoring with the X-Pack monitoring plugin). The official Logstash Reference is the canonical resource when you need more.