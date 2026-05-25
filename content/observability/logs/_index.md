---
title: 🔍 Logs (ELK Stack)
series:
  - observability/logs/my-elk-stack
  - observability/logs/elasticsearch
  - observability/logs/elasticsearch/elasticsearch-setup
  - observability/logs/kibana
  - observability/logs/kibana/kibana-setup
  - observability/logs/logstash
  - observability/logs/logstash/logstash-setup
  - networking/miscellaneous/haproxy
  - networking/miscellaneous/keepalived-vrrp
  - observability/logs/filebeat
  - observability/logs/filebeat/filebeat-setup
---
This is the "logs" half of my observability setup: the complementary half of the [Grafana stack](../metrics/my-grafana-stack) project for metrics. 

Same idea, different data model: instead of *how much* something is happening (metrics), here we want to know *what exactly* happened and *when* (logs).

The base stack of choice is, of course, **ELK** (Elasticsearch + Logstash + Kibana), but with a few additions to mirror a real scalable enterprise pattern.

This is the actual workflow.

5 machines, 6 components:

- **Filebeat** is the log shipper, that runs on every machine where we want to send logs (in my case, only on my VPS).
- The logs are shipped to two **HAProxy Loadbalancers**, who are in HA (High Availability) by using **Keepalived** in active/standby mode.
- LBs receive logs, and forward them to two **Logstash workers**, which are responsible of "standardizing" them for ElasticSearch, which is their final destination.
- Once they arrive in **ElasticSearch** (which runs on my VPS as well), they are ready to be visualized via our **Kibana** dashboard (that runs... you said it, on my VPS).

If you want to read about each component in detail, you can follow this series starting down below, but there's also the abstract walkthrough in [[my-elk-stack|My ELK Stack: how to centralise logs from your VMs]], I suggest to check that out first!