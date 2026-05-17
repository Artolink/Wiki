---
title: How to create your first dashboards in Grafana!
tags:
---
This is just a "101 getting started" guide, but it should be enough for a homelab situation.

There are two ways to get a dashboard up:

1. **Import** a community-made dashboard from [grafana.com/dashboards](https://grafana.com/dashboards): the fastest way to a beautiful, comprehensive dashboard. Used by ~80% of teams.
2. **Build from scratch**: slower, but the only way to learn **PromQL** and produce dashboards that actually match *your* needs.

This page walks through both: a quick import of *Node Exporter Full* (the standard, gives you 200+ panels for free) followed by building a leaner, custom dashboard that you can use as a public landing page.

##  1. Import a pre-made dashboard

Its full of [pre-made dashboards](https://grafana.com/grafana/dashboards/) from the Grafana Community.

You can filter by datasource and exporter. The ones I keep handy are:

| ID                                                       | Dashboard                | What it shows                                                           |
| -------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| [`1860`](https://grafana.com/grafana/dashboards/1860/)   | Node Exporter Full       | Host system metrics (CPU, RAM, disk, network, filesystems...)           |
| [`14282`](https://grafana.com/grafana/dashboards/14282/) | cAdvisor exporter        | Per-container resource usage (CPU, RAM, network, I/O)                   |
| [`12239`](https://grafana.com/grafana/dashboards/12239/) | Nginx VTS exporter       | Web server request rate, latency, status codes, upstreams               |
| [`9628`](https://grafana.com/grafana/dashboards/9628/)   | PostgreSQL               | DB connections, queries, locks, replication lag, cache hit ratio        |
| [`11074`](https://grafana.com/grafana/dashboards/11074/) | Redis                    | Memory usage, commands/sec, keyspace stats, replication                 |
| [`13639`](https://grafana.com/grafana/dashboards/13639/) | Docker host & containers | Combined view: host metrics + container overview                        |

Here I'll show you how to import "Node Exporter Full".

This is the most-used Grafana dashboard on Earth, it basically plots every metric `node-exporter` exposes: about 80 panels across CPU, memory, disk, network, hardware, and a dozen sub-pages.

1. In Grafana: left sidebar → **Dashboards** → **New** → **Import**.
2. In the *"Import via grafana.com"* field, paste the ID: **`1860`**.
3. Click **Load**.
4. On the next page:
   - **Name**: leave as-is or rename (e.g. `Node Exporter Full`).
   - **Folder**: leave to `General` for now.
   - **Datasource (Prometheus)**: pick the `prometheus` datasource you configured.
5. Click **Import**.

That's it. 

The dashboard opens, immediately populated with data from your VPS. 

Click the panels, zoom into time ranges, change the time-range selector in the top-right: everything works.

##  2. Create your dashboard with PromQL

Node Exporter Full is great for *you* (operational deep-dive), but **terrible for a public showcase**: too many panels, too dense, too technical, no narrative.

Let's build a leaner one: 12 panels organized in 4 rows, that gives a public visitor a clear snapshot in 5 seconds.

### 1. Layout

```
ROW 1 — Welcome / branding
┌────────────────────────────────────────────────────────────┐
│  [Text panel] markdown: title + description                 │
└────────────────────────────────────────────────────────────┘

ROW 2 — Server info (static stats)
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐
│ Uptime   │ │ CPU      │ │ Total RAM│ │ Failed services  │
└──────────┘ └──────────┘ └──────────┘ └──────────────────┘

ROW 3 — Live overview (stats with sparkline)
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐
│ CPU %    │ │ Memory % │ │ Disk %   │ │ Load (norm.)     │
└──────────┘ └──────────┘ └──────────┘ └──────────────────┘

ROW 4 — Trends (time-series)
┌────────────────────────┐ ┌──────────────────────────────┐
│ CPU usage over time    │ │ Memory usage over time       │
└────────────────────────┘ └──────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ Network traffic in/out                                      │
└────────────────────────────────────────────────────────────┘
```

### 2. Create the dashboard

1. **Dashboards** → **New** → **New dashboard**.
2. **Add visualization** for each panel below.
3. Datasource always: **prometheus**.

#### Row 1: Welcome (Text panel)

- **Add panel** → switch type to **Text** (not Time series).
- **Mode**: Markdown.
- Content example:

```markdown
# farnetiandrea.it — Live server metrics

This is a **read-only public preview** of the Grafana dashboard monitoring the server that hosts [wiki.farnetiandrea.it](https://wiki.farnetiandrea.it) and the other apps under `farnetiandrea.it`.

Metrics are scraped every 15 seconds from `node-exporter` running on the VPS, shipped via `VMAgent` to a `VictoriaMetrics` time-series database, and displayed here through Grafana.

This setup is the subject of the [Observability series](https://wiki.farnetiandrea.it/observability/grafana-stack/) on my wiki — if you're curious how it works, the full guide is there. 

⚠️ *You're logged in as `Viewer`: you can browse and zoom into any panel, but cannot edit or change data sources.*
```

And Resize the dashboard to full width, ~3 grid rows tall.

#### Row 2: Server info (4 static stat panels)

All **Stat** type, calc `Last (not null)`.

| Title | Query | Unit | Notes |
|---|---|---|---|
| **Uptime** | `time() - node_boot_time_seconds` | `duration (s)` | Pretty-prints "1.43 weeks" |
| **CPU Cores** | `count(count by (cpu) (node_cpu_seconds_total))` | `short` | Display name: `cores` |
| **Total RAM** | `node_memory_MemTotal_bytes` | `bytes (IEC)` | Shows "3.82 GiB" |
| **Failed services** | `count(node_systemd_unit_state{state="failed"} == 1) or vector(0)` | `short` | Thresholds: `0 → green`, `1 → red`. Tells anyone at a glance "is the host healthy right now?". |

#### Row 3: Live overview (4 stat panels with sparkline)

Same Stat panels, but add a **sparkline** by setting **Graph mode → Area** in panel options.

| Title                 | Query                                                                                                  | Unit              | Thresholds                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ----------------- | -------------------------------------------- |
| **CPU usage**         | `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))`                                       | `percent (0-100)` | `<60 = green, 60-80 = yellow, >80 = red`     |
| **Memory usage**      | `100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)`                              | `percent (0-100)` | `<70 = green, 70-85 = yellow, >85 = red`     |
| **Disk usage (`/`)**  | `100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})` | `percent (0-100)` | `<70 = green, 70-85 = yellow, >85 = red`     |
| **Load (normalized)** | `node_load1 / count(count by (cpu) (node_cpu_seconds_total))`                                          | `short`           | `<0.7 = green, 0.7-1.2 = yellow, >1.2 = red` |

> [!INFO]
> **Why normalize the load average?** Linux's `load average` is *not* a percentage: it's the average number of runnable tasks. A load of `4` is "saturated" on a 4-core machine but "extremely overloaded" on a 2-core one. By dividing by the number of CPUs (`node_load1 / count(count by (cpu) (node_cpu_seconds_total))`), you get a *universal* metric: `1.0` means "the machine is exactly at capacity", regardless of how many cores it has. 
> 
> Now the thresholds (`<0.7 green`, `>1.2 red`) work everywhere.

#### Row 4: Trends (3 time-series graphs)

| Title                      | Queries & legends                                                                                                                                                                                                                                                                                  | Unit                | Stacking          | Description                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| **CPU usage over time**    | `sum by (mode) (rate(node_cpu_seconds_total[5m])) / on() count(count by (cpu) (node_cpu_seconds_total))`<br/>Legend: `{{mode}}`                                                                                                                                                                    | `Percent (0.0-1.0)` | enabled, `Normal` | Each color shows where the CPU is spending its time: `idle` is what's left, the rest is actual work.      |
| **Memory usage over time** | `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes` → `Used`<br/>`node_memory_Buffers_bytes + node_memory_Cached_bytes` → `Cached/Buffer`<br/>`node_memory_MemFree_bytes` → `Free`                                                                                                       | `bytes (IEC)`       | enabled, `Normal` | Linux uses unused RAM as filesystem cache: `Cached/Buffer` is technically 'free' if applications need it. |
| **Network traffic in/out** | `rate(node_network_receive_bytes_total{device!~"lo\|docker.*\|veth.*\|br-.*\|tailscale.*"}[5m])` → `RX {{device}}`<br/>`-rate(node_network_transmit_bytes_total{device!~"lo\|docker.*\|veth.*\|br-.*\|tailscale.*"}[5m])` → `TX {{device}}` (minus sign creates a "mirror" effect: RX up, TX down) | `bytes/sec (IEC)`   | disabled          | Network traffic on physical interfaces only (excludes loopback, docker bridges, Tailscale...)             |

#### Make it the default home dashboard

So anonymous visitors landing on `/metrics/` see this dashboard directly:

1. Open the dashboard → click the **star** next to the title (mark as favourite).
2. **Administration** → **Default preferences** → **Home Dashboard** → select `farnetiandrea.it — Server Overview`.
3. **Save**.

Done. From now on, anyone visiting `https://farnetiandrea.it/metrics/` lands directly on this dashboard.

#### Documentation

But what if you want to learn how to create advanced, production-level dashboards?

Here's the main websites you can visit!

- [Prometheus — Querying basics](https://prometheus.io/docs/prometheus/latest/querying/basics/): the canonical PromQL reference.

- [Grafana — Build dashboards: best practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/): official guidelines on layout, naming, performance, panels-per-dashboard, color usage.

- [Grafana — Template variables](https://grafana.com/docs/grafana/latest/dashboards/variables/): how to make a dashboard work for any host/job/environment with a dropdown selector. Essential once you have more than one host.

- [Grafana University](https://university.grafana.com/): free, self-paced courses on Grafana fundamentals. Genuinely useful, not marketing fluff.


##  3. And now?

You have a working pipeline, a custom showcase dashboard, and Node Exporter Full for deep dives. 

The Grafana stack covered in this series is complete for **metrics**. 

From here, the natural extensions are:

- **More exporters**: you can add cAdvisor (Docker metrics), nginx exporter (request rate, latency), postgres-exporter... Same pattern as node-exporter, different metrics.
- **Logs**: Filebeat → Elasticsearch → Kibana. Coming as a separate series.
