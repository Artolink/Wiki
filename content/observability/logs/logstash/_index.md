---
title: ⚙️ Logstash
---

**Logstash** is the workhorse of the ELK stack: it accepts events from many sources, runs them through a pipeline of filters that parse and enrich the data, and sends the result downstream — usually to Elasticsearch, but it can also fan out to Kafka, files, S3, other Logstash instances, etc.

## Pipeline anatomy

A Logstash configuration is structured in three blocks, executed in order on every event:

```
input  { ... }   # Where events come from: beats, syslog, tcp, file, kafka, http, ...
filter { ... }   # What to do with each event: parse, mutate, conditionally route
output { ... }   # Where to send the result: elasticsearch, kafka, file, stdout, ...
```

Each block can contain multiple plugins, and within `filter` they run top-to-bottom. The standard mental model is:

> "An event walks into the pipeline as a raw byte blob from a shipper. It walks out structured, typed, and enriched, on its way to a search engine."

## When you actually need Logstash

You don't always. Filebeat → Elasticsearch direct works fine when:

- Events are already structured (JSON logs from a modern app).
- You don't need to drop fields, rename them, or convert types.
- You're willing to lean on **ingest pipelines** (ES-side preprocessing) for the little parsing you do need.

You **do** want Logstash when:

- Logs are unstructured (think classic nginx access logs, syslog, app stack traces) and you need **grok** / **dissect** to parse them.
- You're combining multiple inputs and need a router (e.g. nginx logs → `logs-nginx-*`, journald → `logs-system-*`).
- You're enriching with external data (GeoIP lookups, asset tag joins, DNS resolution).
- You want a buffer / decoupling layer between the producer and ES — Logstash's **persistent queue** survives ES outages without losing events.

## Why multiple workers

Parsing is CPU-heavy. A single Logstash instance is a single bottleneck. Running **N workers behind a load balancer** lets us:

- Scale parsing throughput horizontally — N workers → ~N× throughput, as long as ES keeps up.
- Roll out config changes one worker at a time, without dropping events.
- Survive single-worker crashes without backpressure on the shippers.

This stack runs **two Logstash workers** (`logstash01` at `10.0.0.21`, `logstash02` at `10.0.0.22`), each in its own Docker container on a dedicated VM, fronted by the HAProxy VIP at `10.0.0.10`. The deploy walkthrough is in [[observability/logs/logstash/logstash-setup|logstash-setup]].