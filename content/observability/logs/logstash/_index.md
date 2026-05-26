---
title: ⚙️ Logstash
---
## 1. What is Logstash?

Logstash is a data-collection pipeline engine, written in JRuby on the JVM. You feed it events from one or more **inputs**, optionally transform them through **filters**, and ship the result out through one or more **outputs**. Every event is a JSON-shaped document with arbitrary fields, plus a few metadata fields (`@timestamp`, `@version`, `host`, etc.).

Logstash is **stateful per pipeline**, **multi-threaded**, and **batch-oriented**: it pulls events from its inputs in batches (default 125), runs them through the filter chain in parallel worker threads, and then ships them out. Throughput is roughly `batch_size × pipeline.workers × filters_efficiency`, capped by the slowest output.

## 2. When you actually need Logstash

You don't always. 

Filebeat → Elasticsearch direct works fine when:

- Events are already structured (JSON logs from a modern app).
- You don't need to drop fields, rename them, or convert types.

But you **do** want Logstash when:

- Logs are unstructured (think classic nginx access logs, syslog, app stack traces)
- You're combining multiple inputs and need a router (e.g. nginx logs → `logs-nginx-*`, journald → `logs-system-*`).
- You're enriching with external data (GeoIP lookups, DNS resolution...).
- You want a buffer layer between the producer and ES: Logstash's **persistent queue** survives ES outages without losing events.

## 3. Core concepts

### 3.1 Inputs

The most common input plugins:

| Plugin     | What it does                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `beats`    | Accepts events pushed by Filebeat / Winlogbeat / Metricbeat over the Lumberjack protocol on port 5044.        |
| `syslog`   | Listens on UDP/TCP 514 for RFC3164 / RFC5424 syslog messages.                                                 |
| `tcp` / `udp` | Generic socket listener — useful for custom log shippers or app-level sinks.                              |
| `file`     | Tails files locally (mostly for testing or for single-host setups).                                          |
| `kafka`    | Pulls from a Kafka topic. Standard pattern when you want a durable buffer in front of Logstash.              |
| `http`     | HTTP endpoint that accepts POST'd events. Handy for webhook ingestion.                                       |

### 3.2 Filters

Where the real work happens. 

The big ones:

| Plugin      | What it does                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------- |
| `grok`      | Pattern-matches a string field against a regex. <br>The canonical tool for unstructured logs. |
| `dissect`   | Faster than grok for **fixed-position** parsing                                               |
| `json`      | Parse a field that contains a JSON string into structured nested fields.                      |
| `mutate`    | Rename, convert types, lowercase/uppercase, split, strip, remove.                             |
| `date`      | Parse a string timestamp into the canonical `@timestamp` field.                               |
| `geoip`     | Look up an IP address in a MaxMind DB and add `country`, `city`, `lat`, `lon` fields.         |
| `kv`        | Parse `key1=val1 key2=val2` style fields.                                                     |
| `useragent` | Parse a User-Agent string into `os`, `browser`, `device` fields.                              |

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

### 3.3 Outputs

| Plugin              | What it does                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| `elasticsearch`     | The canonical destination. <br>Bulk-writes events into an index pattern of your choice. |
| `kafka`             | Publish to a Kafka topic. <br>Used for fan-out to multiple downstream consumers.        |
| `file`              | Append events to a local file. Useful for archival or debugging.                        |
| `stdout`            | Print events to stdout. <br>Useful while developing a pipeline.                         |
| `dead_letter_queue` | Implicit sink for events the main output couldn't accept.                               |

### 3.4 Performance knobs

In `config/logstash.yml`:

- `pipeline.workers: <N>`: number of worker threads per pipeline. Default: number of CPU cores. Each worker pulls a batch and runs it through the filter chain in isolation.
- `pipeline.batch.size: 125`: events per batch. Larger batches improve throughput but increase end-to-end latency.
- `pipeline.batch.delay: 50`: max ms to wait for a batch to fill before flushing. Smaller = lower latency, more overhead.
- `queue.type: memory | persisted`: in-memory (default, fast, lossy on crash) or on-disk (durable, slightly slower).
- `queue.max_bytes: 1gb`: only relevant for `persisted` queues.

### 3.5 Dead Letter Queue (DLQ)

When Elasticsearch rejects an event (mapping conflict, malformed JSON, too-big document), the default behavior is to log a warning and drop it. 

Enable the DLQ to capture those events on disk for later inspection:

```yaml
# config/logstash.yml
dead_letter_queue.enable: true
dead_letter_queue.max_bytes: 1024mb
```

Events in the DLQ can be replayed once you've fixed the mapping. 

Highly recommended in production.


## 4. Why using multiple workers

Parsing is CPU-heavy. 

A single Logstash instance is a single bottleneck. 

Running **N workers behind a load balancer** lets us:

- Scale parsing throughput **horizontally**: N workers = ~N× throughput, as long as ES keeps up.
- Roll out config changes one worker at a time, without dropping events.
- Survive single-worker crashes without backpressure on the shippers.

This stack runs **two Logstash workers** (`logstash01` at `10.0.0.21`, `logstash02` at `10.0.0.22`), each in its own Docker container on a dedicated VM, fronted by the HAProxy VIP at `10.0.0.10`. 

The deploy walkthrough is in [[observability/logs/logstash/logstash-setup|the Logstash setup page]].