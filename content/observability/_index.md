---
title: 📊 Observability
---
##  What is observability?

**Observability** is the ability to *understand the internal state of a system from its external outputs*. 

Not just "is the server up?" That's monitoring, but "*why* is the response time spiking exactly at 14:23 only on this one endpoint?". 

In modern infrastructure, observability rests on a few pillars:

| Pillar      | What it answers                                                               | Format                                                         |
| ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Metrics** | "*How much* CPU is the server using right now? How is it trending over time?" | Numeric time-series (`cpu_used{host="vps01"} 47.3 @ 14:23:05`) |
| **Logs**    | "*What exactly* happened at 14:23 on this server?"                            | Free-form text events (often structured JSON)                  |

There is also the **traces** aspect: "*Where* in the call chain did the request get stuck?", but for the moment, I won't cover that aspect in this Wiki.
