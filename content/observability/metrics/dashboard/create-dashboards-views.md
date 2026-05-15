---
title: "5. Dashboards: from import to building from scratch"
tags:
---

##  What this page is about

Now that Grafana can query VictoriaMetrics, it's time to build something visual. There are two ways to get a dashboard up:

1. **Import** a community-made dashboard from [grafana.com/dashboards](https://grafana.com/dashboards) — the fastest way to a beautiful, comprehensive dashboard. Used by ~80% of teams.
2. **Build from scratch** — slower, but the only way to learn PromQL and produce dashboards that actually match *your* needs.

This page walks through both: a quick import of *Node Exporter Full* (the standard, gives you 200+ panels for free) followed by building a leaner, custom **showcase dashboard** that you can use as a public landing page.

##  Quick win: import Node Exporter Full

This is the most-used Grafana dashboard on Earth, maintained by a community user (`rfraile`) since 2017. It plots every metric `node-exporter` exposes — about 80 panels across CPU, memory, disk, network, hardware, and a dozen sub-pages.

### Import

1. In Grafana: left sidebar → **Dashboards** → **New** → **Import**.
2. In the *"Import via grafana.com"* field, paste the ID: **`1860`**.
3. Click **Load**.
4. On the next page:
   - **Name**: leave as-is or rename (e.g. `Node Exporter Full`).
   - **Folder**: leave to `General` for now (we'll talk about folders for [public-vs-private dashboards](grafana#anonymous-viewer-mode-public-read-only-access) later).
   - **Datasource (Prometheus)**: pick the `prometheus` datasource you configured.
5. Click **Import**.

That's it. The dashboard opens, immediately populated with data from your VPS. Click the panels, zoom into time ranges, change the time-range selector in the top-right — everything works.

##  Building a custom "showcase" dashboard

Node Exporter Full is great for *you* (operational deep-dive), but **terrible for a public showcase**: too many panels, too dense, too technical, no narrative.

Let's build a leaner one — 12 panels organized in 4 rows — that gives a public visitor a clear snapshot in 5 seconds.

### Layout

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

### Create the dashboard

1. **Dashboards** → **New** → **New dashboard**.
2. **Add visualization** for each panel below.
3. Datasource always: **prometheus**.

#### Row 1 — Welcome (Text panel)

- **Add panel** → switch type to **Text** (not Time series).
- **Mode**: Markdown.
- Content:

```markdown
# farnetiandrea.it — Live server metrics

This is a **read-only public preview** of the Grafana dashboard monitoring the server that hosts [wiki.farnetiandrea.it](https://wiki.farnetiandrea.it) and the other apps under `farnetiandrea.it`.

Metrics are scraped every 15 seconds from `node-exporter` running on the VPS, shipped via `VMAgent` to a `VictoriaMetrics` time-series database, and displayed here through Grafana.

This setup is the subject of the [Observability series](https://wiki.farnetiandrea.it/observability/grafana-stack/) on my wiki — if you're curious how it works, the full guide is there. 

⚠️ *You're logged in as `Viewer`: you can browse and zoom into any panel, but cannot edit or change data sources.*
```

Resize to full width, ~3 grid rows tall.

#### Row 2 — Server info (4 static stat panels)

All **Stat** type, calc `Last (not null)`.

| Title | Query | Unit | Notes |
|---|---|---|---|
| **Uptime** | `time() - node_boot_time_seconds` | `duration (s)` | Pretty-prints "1.43 weeks" |
| **CPU Cores** | `count(count by (cpu) (node_cpu_seconds_total))` | `short` | Display name: `cores` |
| **Total RAM** | `node_memory_MemTotal_bytes` | `bytes (IEC)` | Shows "3.82 GiB" |
| **Failed services** | `count(node_systemd_unit_state{state="failed"} == 1) or vector(0)` | `short` | Thresholds: `0 → green`, `1 → red`. Tells anyone at a glance "is the host healthy right now?". |

> [!TIP]
> The `or vector(0)` trick on *Failed services* avoids a `No data` panel when there are zero failed units — it returns an explicit `0` instead.

#### Row 3 — Live overview (4 stat panels with sparkline)

Same Stat panels, but add a **sparkline** by setting **Graph mode → Area** in panel options.

| Title | Query | Unit | Thresholds |
|---|---|---|---|
| **CPU usage** | `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))` | `percent (0-100)` | `<60 = green, 60-80 = yellow, >80 = red` |
| **Memory usage** | `100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` | `percent (0-100)` | `<70 = green, 70-85 = yellow, >85 = red` |
| **Disk usage (`/`)** | `100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})` | `percent (0-100)` | `<70 = green, 70-85 = yellow, >85 = red` |
| **Load (normalized)** | `node_load1 / count(count by (cpu) (node_cpu_seconds_total))` | `short` | `<0.7 = green, 0.7-1.2 = yellow, >1.2 = red` |

> [!IMPORTANT]
> **Why normalize the load average?** Linux's `load average` is *not* a percentage — it's the average number of runnable tasks. A load of `4` is "saturated" on a 4-core machine but "extremely overloaded" on a 2-core one. By dividing by the number of CPUs (`node_load1 / count(count by (cpu) (node_cpu_seconds_total))`), you get a *universal* metric: `1.0` means "the machine is exactly at capacity", regardless of how many cores it has. Now the thresholds (`<0.7 green`, `>1.2 red`) work everywhere.

#### Row 4 — Trends (3 time-series graphs)

##### CPU usage over time (stacked by mode)

- **Type**: Time series.
- **Query**:
  ```promql
  sum by (mode) (rate(node_cpu_seconds_total[5m])) / on() count(count by (cpu) (node_cpu_seconds_total))
  ```
  (Normalizes by CPU count: now the y-axis is `0.0-1.0` regardless of host size.)
- **Legend**: `{{mode}}`
- **Unit**: `Percent (0.0-1.0)`
- **Stacking**: enabled, mode `Normal` (Options → Graph → Stack series).
- **Description**: *"Each color shows where the CPU is spending its time — `idle` is what's left, the rest is actual work."*

##### Memory usage over time

- **Type**: Time series.
- **Queries** (3 separate, each with a custom legend):

  | Query | Legend |
  |---|---|
  | `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes` | `Used` |
  | `node_memory_Buffers_bytes + node_memory_Cached_bytes` | `Cached/Buffer` |
  | `node_memory_MemFree_bytes` | `Free` |

- **Unit**: `bytes (IEC)`
- **Stacking**: enabled, `Normal`.
- **Description**: *"Linux uses unused RAM as filesystem cache — `Cached/Buffer` is technically 'free' if applications need it."*

##### Network traffic in/out

- **Type**: Time series.
- **Two queries on the same panel** (RX positive, TX as negative for the "mirror" effect):

  ```promql
  rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*|br-.*|tailscale.*"}[5m])
  ```
  Legend: `RX {{device}}`

  ```promql
  -rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*|br-.*|tailscale.*"}[5m])
  ```
  Legend: `TX {{device}}`

- **Unit**: `bytes/sec (IEC)`
- **Description**: *"Network traffic on physical interfaces only (excludes loopback, docker bridges, and Tailscale)."*

### Final dashboard settings

After creating all panels:

1. **Dashboard settings (gear icon, top right)** → **General**:
   - **Title**: `farnetiandrea.it — Server Overview`
   - **Description**: `Public read-only view of the VPS metrics. Updated every 15 seconds.`
   - **Tags**: `vps`, `overview`, `public`.
2. **Time options**:
   - **Auto refresh intervals**: add `30s,1m,5m`.
   - **Default time range**: `Last 3 hours`.
3. **Save dashboard** (top-right icon).

### Make it the default home dashboard

So anonymous visitors landing on `/metrics/` see this dashboard directly:

1. Open the dashboard → click the **star** next to the title (mark as favourite).
2. **Administration** → **Default preferences** → **Home Dashboard** → select `farnetiandrea.it — Server Overview`.
3. **Save**.

Done. From now on, anyone visiting `https://farnetiandrea.it/metrics/` lands directly on this dashboard.

##  A few PromQL idioms you'll keep using

Worth memorising — these patterns cover ~80% of what you'll write:

| Idiom | What it does | Example |
|---|---|---|
| `rate(counter[5m])` | Per-second rate of change over the last 5 min | `rate(node_network_receive_bytes_total[5m])` |
| `irate(counter[1m])` | "Instant" rate — uses only the last 2 samples. More reactive but spikier. Use for short-window dashboards. | `irate(node_cpu_seconds_total[1m])` |
| `sum by (label) (...)` | Aggregate while keeping a specific label | `sum by (mode) (rate(node_cpu_seconds_total[5m]))` |
| `avg(...)` | Average across all matching series | `avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))` |
| `1 - X` | Invert (idle → used, free → used) | `1 - rate(node_cpu_seconds_total{mode="idle"}[5m])` |
| `metric_a / metric_b` | Per-label ratio (only works when labels match) | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` |
| `metric_a / on() metric_b` | Division ignoring labels (one side is scalar-like) | `... / on() count(count by (cpu) (node_cpu_seconds_total))` |
| `or vector(N)` | Default value when the query returns nothing | `count(...) or vector(0)` |
| `count(count by (label) (...))` | Number of distinct values for a label | `count(count by (cpu) (node_cpu_seconds_total))` → # cores |

##  Things to know

- **Dashboards are JSON files** under the hood. Click the gear icon → **JSON Model** to see the full structure. You can export, edit, version-control, re-import. Useful for backup, sharing across environments, or templating with Jsonnet/Grafonnet.
- **Variables** (template variables) let you make dashboards reusable. Define a `$host` variable backed by the query `label_values(node_uname_info, instance)` and your panels can become "multi-host" with a dropdown selector. Worth investing in once you have more than one node.
- **Bytes (IEC) vs Bytes (SI)**: IEC = base 1024 (KiB, MiB, GiB — what Linux reports). SI = base 1000 (KB, MB, GB — what marketing materials use). For observability stick with IEC, it's consistent with what `free -h`, `df -h`, etc. show on the host.
- **Time range matters for `rate(...)`**: the window inside `rate(metric[5m])` should be **at least 4 times the scrape interval** to be reliable. With 15s scrape, never go below `[1m]`. Default to `[5m]` for dashboards.
- **Don't `sum(rate(counter[5m]))` then `rate(sum(...))`**: `rate()` always operates on raw counters, never on derived sums. Aggregate *after* `rate()`, not before.

##  Where to next

You have a working pipeline, a custom showcase dashboard, and Node Exporter Full for deep dives. The Grafana stack covered in this series is complete for **metrics**. From here, the natural extensions are:

- **Alerting**: send notifications when `up{job="node"}=0` for more than 2 minutes, or disk usage crosses 90%. Grafana's built-in alerting system is the easy starting point.
- **More exporters**: add cAdvisor (Docker metrics), nginx exporter (request rate, latency), postgres-exporter, ... Same pattern as node-exporter, different metrics.
- **Logs**: parallel pipeline with Promtail → Loki → Grafana (or Filebeat → Elasticsearch → Kibana). Coming as a separate series.
- **Distributed tracing**: Tempo or Jaeger. Useful once you have multiple microservices talking to each other.

Each is independent — pick what gives you the most value on your stack.