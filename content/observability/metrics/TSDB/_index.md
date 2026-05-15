---
title: 🗃️ TSDB
---

##  What is a metrics storage?

A **metrics storage** (or *time-series database*, **TSDB**) is the engine that:

1. **Receives** numeric samples written by scrapers (via `remote_write`, push, ingest API, ...).
2. **Stores** them efficiently on disk, compressed and indexed by *labels*.
3. **Answers queries** over time ranges in a query language (PromQL is the de-facto standard).

It's the "**database**" of the metrics world, with a hard constraint that ordinary databases don't have: **append-mostly, ordered by time, queried by label match + time range**. That's why generic SQL databases (PostgreSQL, MySQL) are inadequate — they'd work but be 100× slower and 10× larger on disk.

##  The TSDB landscape, in one table

| TSDB | Notes |
|---|---|
| **Prometheus** | The original. Built-in scraper. Local storage, no native HA. |
| **VictoriaMetrics** | Drop-in Prometheus replacement. ~10× less disk, native HA cluster mode, much higher cardinality limits. Same PromQL. |
| **Thanos / Cortex / Mimir** | Distributed Prometheus on top of object storage (S3). Solves Prometheus' HA + long retention at the cost of more components. |
| **InfluxDB** | Classic alternative. Own query language (Flux / InfluxQL). Common in IoT/metrics-of-things. |
| **TimescaleDB** | PostgreSQL extension. SQL queries, full ACID. Great when you also need relational queries on top. |
| **Graphite** | Old, simple, still alive. Whisper format, dot-separated metric names (no labels). |
| **OpenTSDB** | HBase-backed. Heavy ops, used at huge scale (e.g. Salesforce, Yahoo!). |

For this project we use **VictoriaMetrics**: it's the modern, no-frills, single-binary solution. 

Same PromQL as Prometheus (everything you learn here transfers to Prometheus shops too), more efficient storage, no operational drama.

##  In this folder

- [VictoriaMetrics](victoriametrics) — Docker container on the VPS, stores all the metrics and answers PromQL queries.