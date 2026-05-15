---
title: "My Grafana Stack: how to monitor metrics of your VMs!"
tags:
  - WebsiteCreation
---
![[Pasted image 20260515145323.png]]
https://farnetiandrea.it/metrics
##  What is the Grafana Stack?

The **Grafana Stack** is the open-source ecosystem of tools maintained by Grafana Labs (and adjacent communities).

It can cover every pillar for observability:

- **Metrics**: node-exporter + VMAgent
- **Logs**: Loki + Promtail
- **Traces**: Tempo + OpenTelemetry

But in this wiki, I’ll show you how to use the Grafana stack only for metrics, while using the ELK stack only for logs. The goal is to showcase different technologies commonly used in production environments, including setups where observability responsibilities are split exactly this way.

Also, each component in the stack is replaceable: you can put Prometheus where I have VictoriaMetrics, and Grafana will still visualize everything via *datasources*. 

The stack is famously modular: pick what you need specifically.

##  The architecture

The whole stack consists in two machines that are on the same **private LAN**:

- My VPS: I use it for publishing things on my domain, and in this case it is used for publishing **Grafana**, via nginx reverse-proxy with HTTPS.
- A random VM named "vmagent", used to scrape metrics from any other VM I want to monitor.

```mermaid
flowchart LR
    Visitor((🌍 visitor))

    subgraph LAN["🔒 Private LAN"]
        subgraph VPS["☁️ VPS — farnetiandrea.it"]
            NE[":9100<br/>node-exporter"]
            
            subgraph DC["~/observability/ (docker-compose)"]
                VM[":8428<br/>VictoriaMetrics"]
                Graf[":3000<br/>Grafana"]
            end
            
            Nginx["🔒 nginx + certbot"]
        end

        subgraph NewVM["☁️ vmagent01"]
            VMA[":8429<br/>VMAgent"]
        end
    end

    VMA -- "scrape" --> NE
    VMA -- "remote_write" --> VM
    Graf -- "PromQL" --> VM
    Visitor -- "/metrics" --> Nginx
    Nginx -- "proxy_pass :3001" --> Graf
```

###  The four roles

| Role                                                                    | Tool                                                          | Where it runs                      | What it does                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Exporter](observability/metrics/node-exporters/_index)**             | [node-exporter](node-exporter.md)                             | on the VPS                         | Sits on `:9100/metrics` and **exposes** numbers about the host (CPU, RAM, disk, net). It doesn't push anywhere — it just makes the data available.                        |
| **[Scraper](observability/metrics/scrapers/_index)**                    | [VMAgent](vmagent.md)                                         | on vmagent                         | Periodically **pulls** the `/metrics` page from each target (here: just the VPS node-exporter for now), then forwards the data to the storage backend via `remote_write`. |
| **[Storage + query](observability/metrics/TSDB/_index)**                | [VictoriaMetrics](observability/metrics/TSDB/victoriametrics) | on the VPS (as a Docker container) | The time-series database. Stores metrics on disk and answers PromQL queries. API-compatible with Prometheus, more efficient in storage and RAM.                           |
| **[Visualization (dashboard)](observability/metrics/dashboard/_index)** | [Grafana](observability/metrics/dashboard/grafana)            | on the VPS (as a Docker container) | The dashboard frontend. Queries VictoriaMetrics, plots graphs, organizes dashboards. Exposed publicly via nginx reverse-proxy at `farnetiandrea.it/metrics`.              |

###  Why this instead of "all in one"?

A single VPS with node-exporter + VMAgent + VictoriaMetrics + Grafana is totally doable, and that would work for a homelab, but **separating the scraper onto a different host is the realistic pattern** you'll find in any company with more than a couple of servers:

- The scraper (VMAgent) is the only piece that needs network access to every monitored target. Putting it on a *dedicated, minimal* VM makes the security perimeter small and clear.
- Any other machine just needs to expose metrics, so that the scraper can harvest them.

Of course, the VictoriaMetrics database and the Grafana dashboard could also have been separated onto different machines, but that part is relatively trivial to understand.

The scraper layer, however, becomes essential once you start dealing with infrastructures of 2000+ machines: you **need** multiple dedicated scraper nodes to distribute the workload properly. That’s why I wanted to separate it here as well, to better distinguish its role and to show you how a scalable infrastructure is typically designed.


##  1. Node-exporter setup



Follow this order — each step is testable on its own before moving to the next:

1. **[node-exporter](node-exporter.md)** on the VPS → first `curl localhost:9100/metrics` and you see metrics.
2. **[VictoriaMetrics](storage/victoriametrics)** in Docker on the VPS → empty DB ready to receive.
3. **[VMAgent](vmagent.md)** on `vmagent01` → scrapes the VPS node-exporter, writes to VictoriaMetrics. First end-to-end test.
4. **[Grafana](visualization/grafana)** in Docker on the VPS, exposed at `/metrics` → first dashboard.
5. **[Dashboards](visualization/dashboards)** — import *Node Exporter Full* and walk through a couple of PromQL queries.