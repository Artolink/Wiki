---
title: 🛰️ Node Exporters
---
---
title: Exporters
---

##  What is an exporter?

An **exporter** is a small program (a daemon, in most cases) that exists for one job: **collect metrics from one specific thing** (a host, a database, a webserver, a custom app...) and **expose them on an HTTP endpoint** in a standard format.

The pattern is universal:

1. The exporter scrapes/measures something locally (read `/proc/stat`, query MySQL with `SHOW GLOBAL STATUS`, ping a URL, ...).
2. It transforms the data into the **Prometheus exposition format** (plain text, label-based, one line per metric).
3. It serves the result on `http://host:port/metrics`.
4. A scraper (Prometheus, VMAgent, Telegraf...) periodically does `GET /metrics` and ships the data to storage.

That's it. An exporter doesn't push anywhere, doesn't store anything long-term, doesn't talk to the database. It just *exposes*.

##  The exposition format, in one example

Try `curl localhost:9100/metrics` on any host with node-exporter installed and you'll see lines like:

```
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 53413.94
node_cpu_seconds_total{cpu="0",mode="user"} 1247.32
node_cpu_seconds_total{cpu="0",mode="system"} 583.18
node_cpu_seconds_total{cpu="1",mode="idle"} 53801.41
...
```

Three parts:
- **Metric name** (`node_cpu_seconds_total`) — what the value measures.
- **Labels** (`{cpu="0",mode="idle"}`) — dimensions to filter / aggregate by.
- **Value** (`53413.94`) — the numeric value *right now*.

The two comment lines on top declare what the metric means (`HELP`) and what kind of metric it is (`TYPE`: counter, gauge, histogram, summary). They're not strictly needed for the scraper, but they make the metrics self-documenting.

##  Common exporters worth knowing

| Exporter | Measures | Port (default) |
|---|---|---|
| **node-exporter** | Linux host (CPU, RAM, disk, net, filesystem) | `9100` |
| **cAdvisor** | Docker / container resource usage | `8080` |
| **mysqld-exporter** | MySQL/MariaDB internal state | `9104` |
| **postgres-exporter** | PostgreSQL internal state | `9187` |
| **redis-exporter** | Redis instance | `9121` |
| **nginx-vts-exporter** | Nginx connections, request rates | `9913` |
| **blackbox-exporter** | HTTP/TCP/ICMP probes (synthetic monitoring) | `9115` |
| **kube-state-metrics** | Kubernetes objects state | `8080` |
| **process-exporter** | per-process metrics by command name | `9256` |
| **Your custom one** | Whatever your app does | (you decide) |

You can also write your **own exporter** in any language with a Prometheus client library (Python, Go, Java, Ruby, Node...) — useful when you want to expose business metrics (orders per minute, signups per hour, queue lag).

##  In this folder

For now we cover just one exporter: the most common one.

- [Node Exporter](node-exporter) — host system metrics on the VPS.