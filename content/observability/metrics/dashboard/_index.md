---
title: 📉 Grafana
---
---

##  What is the visualization layer?

The **visualization layer** is the "single pane of glass" of an observability stack: the place where you actually *look* at the metrics, build dashboards, run ad-hoc queries, drill down into incidents.

It sits on top of the storage (VictoriaMetrics in our case) and queries it via PromQL. It doesn't store data itself, doesn't scrape anything — its only state is the **configuration**: dashboards, datasources, users, alerts.

In our stack, this layer is **Grafana**, the de-facto standard for metrics visualization.

##  Why Grafana

A few reasons it became the standard:

- **Multi-datasource**: speaks Prometheus, VictoriaMetrics, Loki, Elasticsearch, InfluxDB, ClickHouse, PostgreSQL, MySQL, CloudWatch, MQTT, Tempo, Jaeger, and ~70 others. The *same* dashboard can mix data from multiple sources in different panels.
- **Open-source core (AGPL)**, no SaaS lock-in. Self-host forever.
- **Massive dashboard ecosystem**: [grafana.com/dashboards](https://grafana.com/dashboards) has thousands of community-maintained, ready-to-import dashboards. Often you don't need to write anything — just import.
- **PromQL native**, so the queries you write here transfer 1:1 to a Prometheus shop.

##  In this folder

- [Grafana](grafana) — Docker container on the VPS, exposed via nginx reverse-proxy at `farnetiandrea.it/metrics`.
- [Dashboards](create-dashboards-views.md) — import Node Exporter Full and walk through your first PromQL queries.