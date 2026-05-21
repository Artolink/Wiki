─── content/observability/logs/filebeat/_index.md ───────────────────
---
title: 📦 Filebeat setup
---

**Coming in Phase 4**: what Filebeat is, why a push-from-edge shipper, push (Beats) vs pull (vmagent in the [metrics stack](../../metrics/my-grafana-stack)).

native install on the VPS, `filebeat.yml` configuration, modules and processors, output to the HAProxy VIP, testing.

─── content/observability/logs/load-balancers/haproxy-for-logs.md ───
---
title: HAProxy as a TCP load balancer
---

**Coming in Phase 5**: complete generic guide on HAProxy (TCP vs HTTP mode, frontends/backends, balance algorithms, health checks, ACLs, stats page), followed by the actual config used on lb01/lb02 in this lab.

─── content/observability/logs/load-balancers/keepalived-vrrp.md ────
---
title: Keepalived and VRRP
---

**Coming in Phase 5**: complete generic guide on Keepalived and VRRP (VIP, priority, master/backup, advert interval, preemption, tracking scripts, split-brain), followed by the actual `keepalived.conf` used in this lab.

─── content/observability/logs/logstash/_index.md ───────────────────
---
title: 📑 Logstash setup
---

**Coming in Phase 3**: what Logstash is, input/filter/output stages, why multiple workers behind a load balancer.
complete generic guide on Logstash (pipeline anatomy, input/filter/output plugin reference, performance, DLQ, persistent queue), followed by the actual docker-compose + pipeline used in this lab.

─── content/observability/logs/elasticsearch/_index.md ──────────────
---
title: 🔎 Elasticsearch setup
---

**Coming in Phase 1**: what Elasticsearch is, indices, shards, mappings, ILM, single-node vs cluster mode.

docker-compose service on the VPS, single-node config, persistence volume, `vm.max_map_count` host setting, security disabled for lab, curl health checks.

─── content/observability/logs/kibana/_index.md ─────────────────────
---
title: 📋 Kibana setup
---

**Coming in Phase 2**: what Kibana is, Discover / Visualize / Dashboard, data-views (the 8.x rename from index-patterns).

docker-compose service, point at local ES, nginx reverse-proxy on `/logs/` (sub-path config), anonymous read-only role.