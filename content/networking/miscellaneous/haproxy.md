---
title: "HAProxy: a reliable TCP load balancer"
---

## What is HAProxy

**HAProxy** is a fast, single-binary load balancer and reverse proxy used in production for everything from edge HTTPS termination to internal service-to-service traffic balancing. It's CPU-light, memory-light, written in C, and famously stable: a single instance routinely handles tens of thousands of connections per second on commodity hardware.

What it gives you over a plain DNS round-robin:
- **Active health checks**: backends marked DOWN are immediately removed from rotation.
- **Layer-4 and layer-7 awareness**: you can balance bytes blindly (TCP mode) or inspect HTTP headers/paths/cookies (HTTP mode).
- **Stats and observability**: a built-in admin page shows live throughput, error counts, per-backend status.
- **Graceful reloads**: configuration changes apply without dropping in-flight connections.

For log ingestion in front of a Logstash pool, HAProxy operates in **TCP mode**: the Beats protocol is binary, not HTTP, so there is nothing to inspect at layer 7. We're just balancing TCP byte streams across a pool of identical backends.

## Core concepts

A HAProxy configuration is built from four section types:

| Section      | What it represents                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `global`     | Process-wide settings: user/group, log target, max connections, tuning. One per config.                     |
| `defaults`   | Default values inherited by `frontend` and `backend` blocks below it. Reduces repetition.                   |
| `frontend`   | A listening socket: which IP, which port, in which mode (TCP/HTTP), and which backend to forward to.        |
| `backend`    | The pool of upstream servers HAProxy can send traffic to, plus health checks and balance algorithm.         |

You can also have:
- `listen`: shorthand for `frontend + backend` collapsed in one block. Common for the stats page.
- `resolvers`: DNS resolution configuration for backends specified by hostname (re-resolves periodically).

A request goes: client → **frontend** (matches the listener) → optional ACL routing → **backend** (server pool, picked by the balance algorithm) → actual `server` line.

### Server entries

Inside a backend, each `server` line declares a target:

```
server logstash01 10.0.0.10:5044 check
```

- Name (`logstash01`): label for stats and logs.
- Address + port: where to forward to.
- `check`: enable health checking (TCP connect by default; you can specify HTTP, etc.).

### Mode: TCP vs HTTP

- `mode tcp`: HAProxy treats traffic as opaque bytes. No HTTP header inspection, no path-based routing. Required for non-HTTP protocols (Beats, MySQL, SSH, raw sockets).
- `mode http`: HAProxy parses HTTP. You can match on `Host`, path, headers, cookies; you can log per-request status codes; you can add headers; you can do session affinity by cookie.

A frontend and its backend(s) must agree on the mode.

## Common patterns

### Balance algorithms

| Algorithm     | When to use it                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `roundrobin`  | The default. Each new connection goes to the next server in line. Fine for stateless ingest like log shipping.     |
| `leastconn`   | New connections go to the backend with the fewest active connections. Better for long-lived sessions (DBs, etc.).  |
| `source`      | Hash of client source IP picks the backend. Pseudo-stickiness without cookies (useful for stateful TCP services).  |
| `uri`         | HTTP only: hash of the request URI picks the backend. Good for cache-friendliness (same URL → same cache node).    |
| `random`      | Picks at random, weighted by `weight`. Surprisingly good when backends have varying capacity.                      |

For log ingest the typical answer is `roundrobin`: events are independent, backends are identical, fairness > affinity.

### Health checks

Two flavours, very different cost and meaning:

- **TCP check** (`check` on the `server` line, in TCP mode): HAProxy opens a TCP connection to the backend port. If the handshake completes, the backend is UP. Cheap (~milliseconds), but only tells you the port is open: the process behind might be deadlocked or its queues full.
- **HTTP check** (`option httpchk GET /health`, in HTTP mode): HAProxy issues an HTTP GET and inspects the response. Far more meaningful (you can wire it to an app-level liveness endpoint), but obviously HTTP-only.

For TCP-mode balancing of opaque protocols, TCP check is your only option. Tune `inter` (check interval), `rise` (consecutive successes to mark UP), `fall` (consecutive failures to mark DOWN) to your tolerance.

### Stats page

A built-in real-time dashboard you can expose on a separate port (and behind auth):

```
listen stats
    bind *:8404
    mode http
    stats enable
    stats uri /stats
    stats refresh 5s
    stats auth admin:secret-please
```

Shows live throughput, per-server status, sessions count, error rate. The first thing to open during an incident.

### ACLs (HTTP mode)

ACLs let you match HTTP attributes and pick a backend conditionally. Common patterns:

```
acl is_api  path_beg /api
acl is_admin hdr(host) -i admin.example.com
use_backend api_backend   if is_api
use_backend admin_backend if is_admin
default_backend public_backend
```

Not relevant for our TCP-mode log ingest, but it's the bread and butter of HAProxy in HTTP edge deployments.

### TLS termination vs passthrough

- **Termination**: HAProxy holds the certificate, decrypts incoming TLS, forwards plaintext to the backend. Lets HAProxy inspect HTTP (mode http) and route on it.
- **Passthrough**: HAProxy treats TLS bytes as opaque (mode tcp), forwards them to a backend that holds the cert and terminates itself. Used when the cert must live on the backend or when you can't decrypt for compliance reasons.

For our beats traffic over Tailscale we don't TLS-wrap at all (Tailscale already encrypts), so this dimension doesn't apply here.

## Pitfalls

> [!WARNING] Things that will bite you
> - **`maxconn` and the kernel**: HAProxy's `maxconn` is a logical cap. The OS also has `net.core.somaxconn` (listen backlog) and `nofile` (open file descriptors). Crank both up if you expect to push past a few thousand concurrent connections, or HAProxy will silently refuse new connects.
> - **Reload, don't restart**: `systemctl reload haproxy` does a hot reload (new instance picks up new config, old one drains in-flight connections). `systemctl restart haproxy` kills active connections. Always reload during a deploy.
> - **Sticky sessions with stateless backends**: don't enable `cookie` stickiness or `source` hashing unless the backend really has session state. Otherwise you just lose load distribution for no reason.
> - **TCP mode logs nothing about the payload**: in `mode tcp` you cannot see HTTP requests in the HAProxy log. If you need request-level logs, the proxied protocol must be HTTP and you must be in `mode http`. For Beats, all you'll see are connect/disconnect events and bytes transferred.
> - **Backend specified by hostname**: HAProxy resolves the hostname ONCE at startup unless you configure `resolvers`. If a backend IP changes (DHCP, container restart), HAProxy keeps sending traffic to the old IP until reload.
> - **`option redispatch` is your friend**: if HAProxy gets a 5xx from a backend it just picked, by default it doesn't try another. Enable redispatch and it will retry.

## In this lab

We run **identical HAProxy instances** on lb01 and lb02, in TCP mode, balancing the Beats port across both Logstash workers with TCP health checks. Keepalived (see [[keepalived-vrrp|the next page]]) handles the VIP failover between the two.

```haproxy
# /etc/haproxy/haproxy.cfg on lb01 and lb02 (identical)

global
    log /dev/log local0
    log /dev/log local1 notice
    user haproxy
    group haproxy
    daemon
    maxconn 8000

defaults
    log global
    mode tcp                       # default to TCP for everything in this file
    option tcplog                  # log connect/disconnect, useful for debugging
    option dontlognull
    timeout connect 5s             # how long we wait when opening a connection to a backend
    timeout client  60s            # how long we tolerate an idle client (Filebeat keep-alive)
    timeout server  60s            # idle server timeout (Logstash keep-alive)
    retries 3

# ── Beats traffic ─────────────────────────────────────────────────────────────
frontend beats_in
    bind *:5044                    # the port Filebeat ships to (the VIP we'll set on Keepalived listens here)
    mode tcp
    default_backend logstash_pool

backend logstash_pool
    mode tcp
    balance roundrobin             # log events are stateless, round-robin is fine
    option tcp-check               # TCP health check (connect to the port, expect success)
    default-server inter 3s fall 3 rise 2
    server logstash01 logstash01:5044 check
    server logstash02 logstash02:5044 check

# ── Stats page (port 8404, basic auth) ────────────────────────────────────────
listen stats
    bind *:8404
    mode http                      # stats is HTTP even when the rest of the config is TCP
    stats enable
    stats uri /
    stats refresh 5s
    stats auth admin:<change-me>
```

Reload with `sudo systemctl reload haproxy` after every change. Watch the stats page at `http://lb01.tailscale-domain:8404/` (over Tailscale, never expose it publicly) to confirm both backends show UP after starting Logstash on logstash01 and logstash02.

> [!TIP]
> Test the failover before relying on it. With Filebeat shipping in the background:
> 1. On lb01, watch the HAProxy stats page.
> 2. On logstash01, `docker compose down`. Within `inter * fall = 9 seconds` you should see logstash01 go RED in stats.
> 3. Check `lb01:8404`: incoming connections are now all on logstash02.
> 4. Filebeat keeps shipping, Kibana keeps showing events, no events lost.

## Where to go next

- Next in the series: **[[keepalived-vrrp|Keepalived and VRRP]]** — pairing HAProxy with Keepalived to get a VIP that floats between lb01 and lb02 so a whole-LB failure is also handled, not just a backend failure.
- HAProxy is much deeper than this page (sticky sessions, queueing, advanced ACLs, Lua scripting, dynamic backend updates via the Runtime API): the official **HAProxy Configuration Manual** is the canonical reference when you need more.