---
title: 🌐 Web serving
series:
  - DNS-domains
  - nginx-web-server-setup
  - tls-certificates
  - website-resilience
  - scaling-the-load-balancer
---
Everything it takes to serve a website or application. 

Read in order, these pages tell one story: from a typed name to a site that survives failures and traffic.

1) **[[DNS-domains|DNS & domains]]**: how a name becomes an IP: records, resolvers, and the full path of a lookup.
2) **[[nginx-web-server-setup|NGINX setup]]**: how to serve the site.
3) **[[tls-certificates|TLS certificates]]**: secure it: inspect, verify, convert and troubleshoot certificates.
4) **[[haproxy|HAProxy]]**: balance it: a reliable TCP load balancer in front of your backends.
5) **[[keepalived-vrrp|Keepalived / VRRP]]**: make the balancer highly available: floating IP + automatic failover.
6) **[[website-resilience|Website/App resilience]]**: tips/overview to make the whole site/app resilient and survive failures
7) **[[scaling-the-load-balancer|Scaling the load balancer]]**: survive success too: what to do when there's too much throughput and the balancer can't take the traffic anymore.