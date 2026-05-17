---
title: 📡 Scrapers
---

##  What is a scraper?

A **scraper** is the piece of the observability pipeline that **pulls** metrics from the targets that expose them and **forwards** them to the TSDB. 

It's the connection between the [exporters](../node-exporters/_index) (passive, just listening) and the [database](../TSDB/_index) (passive, just receiving).

The job is conceptually simple:

1. Read a configuration file listing the targets (`http://10.0.0.5:9100/metrics`, `http://10.0.0.7:8080/metrics`...) and how often to poll them.
2. Every `scrape_interval` seconds (typically 15s or 30s), do a `GET /metrics` on each target.
3. Parse the response (Prometheus exposition format).
4. **Forward** it to a TSDB via `remote_write`.

##  A few scrapers

| Tool                        | Origin          | Notes                                                                                                                                                                |
| --------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prometheus** (monolithic) | Prometheus      | Default scraper that comes built-in. Stores locally.                                                                                                                 |
| **VMAgent**                 | VictoriaMetrics | Lightweight scrape-only agent. ~10× less RAM than Prometheus at the same scrape load. Native `remote_write` support.                                                 |
| **Telegraf**                | InfluxData      | Generalist agent, 200+ input plugins, multiple output protocols. Heavier, but versatile. Useful when you also need to ingest non-Prometheus formats (SNMP, MQTT...). |
| **OpenTelemetry Collector** | CNCF            | Cross-vendor agent for metrics + logs + traces. Future-proof, less mature for metrics-only scenarios.                                                                |

I use **VMAgent** in my stack for two reasons:
1. It's the natural partner of [[victoriametrics|VictoriaMetrics]]: written by the same team, optimised for the pair.
2. It demonstrates the **split architecture** in its purest form: a tiny agent on a dedicated VM, just scraping + forwarding.
