---
title: 📡 Scrapers
---

##  What is a scraper?

A **scraper** is the piece of the pipeline that **pulls** metrics from the targets that expose them and **forwards** them to the storage backend. It's the connecting tissue between the [exporters](../exporters/) (passive, just listening) and the [storage](../storage/) (passive, just receiving).

The job is conceptually simple:

1. Read a configuration file listing the targets (`http://10.0.0.5:9100/metrics`, `http://10.0.0.7:8080/metrics`, ...) and how often to poll them.
2. Every `scrape_interval` seconds (typically 15s or 30s), do a `GET /metrics` on each target.
3. Parse the response (Prometheus exposition format).
4. Either **store locally** (Prometheus monolithic mode) or **forward** to a remote storage via `remote_write` (everyone else).

##  Prometheus monolithic vs split architecture

In small setups, **Prometheus itself is the scraper**: it pulls, stores, and answers queries — three jobs in one binary. Easy to start with, hard to scale.

In production, those three jobs get **split** to scale independently:

- A lightweight **scraper agent** runs as close as possible to the targets (or in a separate dedicated host) — its only job is "pull and forward".
- A **central storage** ingests data via `remote_write` from one or more scrapers.
- The storage is also the **query backend** for Grafana.

This is the pattern in our architecture: **VMAgent** on `vmagent` scrapes the VPS targets and forwards everything to **VictoriaMetrics** on the VPS via `remote_write`. The two roles are separate processes on separate hosts.

##  Scraper tools

| Tool | Origin | Notes |
|---|---|---|
| **Prometheus** (monolithic) | Prometheus | Default scraper that comes built-in. Stores locally. |
| **VMAgent** | VictoriaMetrics | Lightweight scrape-only agent. ~10× less RAM than Prometheus at the same scrape load. Native `remote_write` support. |
| **Telegraf** | InfluxData | Generalist agent, 200+ input plugins, multiple output protocols. Heavier but versatile. Useful when you also need to ingest non-Prometheus formats (SNMP, MQTT, JMX, ...). |
| **Grafana Agent / Alloy** | Grafana Labs | Their own all-in-one agent (scrape + log shipping + traces). Newest of the bunch. |
| **OpenTelemetry Collector** | CNCF | Cross-vendor agent for metrics + logs + traces. Future-proof, less mature for metrics-only scenarios. |

We use **VMAgent** here for two reasons:
1. It's the natural partner of VictoriaMetrics — written by the same team, optimised for the pair.
2. It demonstrates the **split architecture** in its purest form: a tiny agent on a dedicated VM, just scraping + forwarding.

##  In this folder

- [VMAgent](vmagent) — on the dedicated `vmagent` VM, scrapes the VPS targets, forwards to VictoriaMetrics.