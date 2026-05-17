---
title: 📉 Grafana
---

##  What is the visualization layer?

The **visualization (or dashboard) layer** is the place where you actually *look* at the metrics, build dashboards, run ad-hoc queries, and drill down into incidents.

It sits on top of the storage (VictoriaMetrics in our case) and queries it via PromQL. 

It doesn't store data itself, and it doesn't scrape anything.

In our stack, this layer is **Grafana**, the de-facto standard for metrics visualization.

##  Why Grafana

A few reasons it became the standard:

- **Multi-datasource**: speaks Prometheus, VictoriaMetrics, Loki, Elasticsearch, InfluxDB, PostgreSQL, MySQL, Jaeger, and ~70 others. 
  The *same* dashboard can mix data from multiple sources in different panels.
- **Open-source:**, no vendor lock-in.
- **Massive dashboard ecosystem**: [grafana.com/dashboards](https://grafana.com/dashboards) has thousands of community-maintained, ready-to-import dashboards. Often you don't need to write anything, just import.
- **PromQL native**, so the queries you write here transfer 1:1 to Prometheus.

##  In this folder

- You can [check out how to install and setup Grafana](grafana).
- You can [learn how to create dashboards](create-dashboards-views.md) and move your first steps in Grafana.