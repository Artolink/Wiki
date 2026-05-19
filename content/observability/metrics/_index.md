---
title: 📈 Metrics (Grafana stack)
series:
  - observability/metrics/exporters/node-exporter
  - observability/metrics/TSDB/victoriametrics
  - observability/metrics/scrapers/vmagent
  - observability/metrics/dashboard/grafana
---
Here you'll find a few observability notions concerning metrics, along with my personal metrics stack for the VPS hosting `farnetiandrea.it`. 

Four components, two machines (VPS + a dedicated scraper VM):

- [Node Exporter](node-exporter.md): host-native exporter on the VPS, exposes system metrics on `:9100/metrics`.
- [VMAgent](scrapers/vmagent): runs on a dedicated VM, pulls metrics from the VPS targets and forwards them via `remote_write` to VictoriaMetrics.
- [VictoriaMetrics](TSDB/victoriametrics): Docker container on the VPS, TSDB and PromQL query engine.
- [Grafana](dashboard/grafana): Docker container on the VPS for dashboards and visualization, exposed publicly at [farnetiandrea.it/metrics](https://farnetiandrea.it/metrics) as a read-only public preview.

For the full step-by-step walkthrough, check out [[my-grafana-stack|my Grafana stack]].
 ***
 