---
title: 🛰️ Exporters
---

##  What is an exporter?

An **exporter** is a small program (a daemon, in most cases) that exists for one job: **collect metrics from one specific thing** (a host, a database, a webserver, a custom app...) and **expose them on an HTTP endpoint** in a standard format.

The pattern is universal:

1. The exporter reads something locally (reads `/proc/stat`, queries MySQL with `SHOW GLOBAL STATUS`, pings a URL...).
2. It transforms the data into the **Prometheus exposition format** (plain text, label-based, one line per metric).
3. It serves the result on `http://host:port/metrics`.

That's it. 

An exporter doesn't push anywhere, doesn't store anything long-term, doesn't talk to the database: It just *exposes*.

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

You can also write your **own exporter** in any language with a Prometheus client library (Python, Go, Java...).
