---
title: 🚚 Filebeat
---

**Filebeat** is the lightweight log shipper of the ELK pipeline: a small, single-purpose Go binary that runs on every host where logs are generated. 

It reads files (`/var/log/*`), the systemd journal, or container stdout, optionally adds metadata, and pushes the result over the network, either to a Logstash worker, or directly to Elasticsearch.

## The Beats family

Filebeat is one of several "Beats": lightweight shippers from Elastic, each specialised for a single source type:

| Beat           | What it reads                                               |
| -------------- | ----------------------------------------------------------- |
| **Filebeat**   | Log files, journald, container logs                         |
| **Metricbeat** | System and service metrics (CPU, memory, MySQL, nginx, ...) |
| **Packetbeat** | Network packets (HTTP, DNS, MySQL traffic, ...)             |
| **Auditbeat**  | Linux audit events (kernel auditd, file integrity)          |
| **Heartbeat**  | Uptime / latency probes (HTTP, TCP, ICMP)                   |

Pick the one that matches the source.

## Push VS Pull

This site already runs the [[observability/metrics/|metrics]] half of observability with a **pull** model: VictoriaMetrics asks `vmagent` for samples, `vmagent` asks `node_exporter` for samples. 

The whole flow is reactive: nothing happens until the database scrapes.

Filebeat is the opposite: **push**. 

The agent decides when to send, the central side is just a TCP listener. 

Trade-offs:

| Aspect               | Pull (Prometheus / vmagent)              | Push (Filebeat → Logstash)                 |
| -------------------- | ---------------------------------------- | ------------------------------------------ |
| Discovery            | Central side needs to know all targets   | Targets just need to know the central side |
| Auth                 | Targets accept central-side connections  | Central side accepts target connections    |
| Backpressure         | Trivial: central just scrapes less often | Needs explicit queues / load balancers     |
| Spikes / bursty data | Smoothed by scrape interval              | Hits the central side immediately          |
| Suits...             | Metrics (continuous, regular, lossy ok)  | Logs (discrete, irregular, must not drop)  |

Pull works for metrics because samples are continuous: missing one is fine, the next one is right behind. 

Logs are discrete events: each line is meaningful on its own, and you don't get a chance to "ask again later". 

A push model with a buffer (Logstash + persistent queue) handles that asymmetry better than scraping ever could.

The Filebeat deploy walkthrough is in [[observability/logs/filebeat/filebeat-setup|filebeat-setup]].