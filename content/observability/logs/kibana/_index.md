---
title: 📋Kibana
---
**Kibana** is the web UI that sits on top of Elasticsearch. 

It does not store anything itself: every panel, every chart, every saved search is built on top of ES queries that Kibana issues live as you interact with it.

You can find the deploy walkthrough for this site in [[observability/logs/kibana/kibana-setup|the Kibana setup guide]]. 

The public read-only configuration is in the [[observability/logs/kibana/kibana-viewer-mode|Kibana viewer-mode page]].

## Main areas

| Area                  | What it's for                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| **Discover**          | Free-form exploration of an index. <br>Filter, search, drill into individual documents.        |
| **Dashboard**         | Saved combinations of visualisations. <br>The destination for most "ops monitoring" use cases. |
| **Visualize Library** | Reusable charts (bar, line, pie, map, heatmap, gauge) built against an index.                  |
| **Lens**              | A drag-and-drop chart builder.                                                                 |
| **Stack Management**  | Manage Index templates, ILM policies, users, roles, data views, saved objects.                 |
| **Dev Tools**         | An interactive ES console, useful for ad-hoc queries while developing.                         |

## Data views

Before you can query data in Kibana, you have to tell it *which* indices to expose. 

A **data view** is a saved pattern like `logs-*` or `filebeat-*` that Kibana resolves at query time. 
