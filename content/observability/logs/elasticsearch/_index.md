---
title: Elasticsearch
---

**Elasticsearch** (ES) is a distributed, JSON-native, schema storage and search engine. 

In an ELK pipeline it sits at the end of the chain: Logstash sends parsed events to it, Kibana reads from it. 

Everything ES does is reachable over HTTP/JSON: there is no separate query language to learn, just `curl :9200/<index>/_search` with a JSON body.

## Core concepts

- **Index**: like a "table". Logical namespace where documents live (e.g. `logs-nginx-*`).
- **Document**: a JSON object stored in an index. Has a unique `_id` and arbitrary fields.
- **Shard**: the physical unit of storage. An index is split into N primary shards. Shards can live on different nodes, which is how ES scales horizontally.
- **Replica**: a copy of a primary shard on a different node. Provides high availability (HA) and adds read capacity. Replicas only make sense on a multi-node cluster.
- **Mapping**: the schema for an index: which fields exist, what type each one is (`keyword`, `text`, `date`, `ip`, `geo_point`...).
- **ILM (Index Lifecycle Management)**: automatic policies that move indices through phases over time: *hot* (write+search, on fast disks), *warm* (read-only, slower disks), *cold* (rarely accessed), *delete* (gone). Critical for log workloads, otherwise old logs eat all the disk!

## When you actually need Elasticsearch

What ES gives you that's hard to replicate cheaply is:

- **Full-text search out of the box**: language analyzers, fuzzy matching, suggestions...
- **Sub-second aggregations** over millions of rows: top-N, percentiles, histograms, geo-bounding-boxes: all interactive.
- **Kibana** is built specifically against ES: the moment you choose Kibana as the UI, ES comes along with it.

For metrics specifically, a TSDB (VictoriaMetrics, Prometheus, InfluxDB) is usually a better fit. 

For logs and search-heavy queries, ES is the canonical answer.

## Single-node vs cluster

In production, ES is a **cluster** of nodes (3+ for quorum-based master election). 

Each node can have one or more roles: *master* (cluster state), *data* (hold shards), *ingest* (run preprocessing pipelines), *coordinating* (route queries).

In this lab we run a **single-node** instance on the VPS:

- `discovery.type=single-node` tells ES to skip the cluster discovery and election logic entirely.
- The cluster health will always be **yellow** rather than green, because primary shards exist but replicas can't be allocated (replicas must live on a *different* node).

You can see the deploy procedure [[observability/logs/elasticsearch/elasticsearch-setup|here]].