---
title: 📋Kibana
description: The web UI of the Elastic Stack — search, dashboards, and Elasticsearch administration over a JSON-driven backend.
---

**Kibana** is the web UI that sits on top of Elasticsearch. It does not store anything itself — every panel, every chart, every saved search is built on top of ES queries that Kibana issues live as you interact with it.

## Main areas

| Area              | What it's for                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Discover**      | Free-form exploration of an index. Filter, search, drill into individual documents.                |
| **Dashboard**     | Saved combinations of visualisations. The destination for most "ops monitoring" use cases.         |
| **Visualize Library** | Reusable charts (bar, line, pie, map, heatmap, gauge) built against an index.                    |
| **Lens**          | A drag-and-drop chart builder that infers reasonable defaults. The modern entry-point for new viz. |
| **Stack Management** | Index templates, ILM policies, users, roles, data views, saved objects.                         |
| **Dev Tools**     | An interactive ES console — useful for ad-hoc queries while developing.                            |

## Data views (formerly "index patterns")

Before you can query data in Kibana, you have to tell it *which* indices to expose. A **data view** is a saved pattern like `logs-*` or `filebeat-*` that Kibana resolves at query time. In Kibana ≤ 7.x these were called *index patterns*; they're the same thing.

## Auth model in 8.x

Kibana 8.x ships with X-Pack security on by default. The default auth flow is **basic** (username + password). You can layer additional providers on top:

- **basic** — username/password login form. Always present unless explicitly disabled.
- **anonymous** — automatic authentication as a chosen ES user, no prompt. Used here for the public read-only viewer.
- **token / saml / oidc / kerberos / pki** — SSO integrations.

Each provider has an `order`; the one with the lowest order is the default landing experience. The deploy walkthrough for this site is in [[observability/logs/kibana/kibana-setup|kibana-setup]]; the public read-only configuration is in [[observability/logs/kibana/kibana-viewer-mode|kibana-viewer-mode]].