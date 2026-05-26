---
title: "HAProxy: a reliable TCP load balancer"
---

This page is two things in one. 

The first half is a **complete reference to HAProxy** as it applies to log-shipping pipelines: what it is, how the configuration is structured, the knobs that matter, the pitfalls that bite first-timers. 

The second half is a **real use-case example**, showing the HAProxy configuration I used for my Observability logs lab (ELK stack).

## 1. What is HAProxy?

HAProxy (High Availability Proxy) is the de-facto open-source load balancer. Born in 2001, written in C, runs as a single event-driven process, comfortably handles tens of thousands of concurrent connections on commodity hardware. The same binary fronts a huge share of HTTPS traffic at large cloud providers, but it's just as comfortable balancing plain TCP — which is exactly what we need for log shipping.

For an ELK pipeline, HAProxy plays a focused role: accept incoming Beats / Syslog / Kafka traffic from many producers and distribute it across a pool of Logstash workers. No L7 inspection, no header rewriting, no content-based routing. Just "spread these TCP connections fairly across N upstreams".

## 2. Configuration anatomy

An `haproxy.cfg` has a fixed structure with four kinds of sections:

| Section     | Purpose                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| `global`    | Process-wide settings — user/group, log destination, max connections, stats socket, daemon mode |
| `defaults`  | Default values inherited by all `frontend`/`backend` blocks unless overridden                 |
| `frontend`  | How clients connect — which port to bind, which mode (TCP/HTTP), default backend             |
| `backend`   | A pool of upstream servers with a balance algorithm and health checks                         |

There's also `listen` (combined frontend+backend) and `resolvers` (DNS service discovery), but for log shipping the four above are enough.

## 3. TCP vs HTTP mode

HAProxy can operate in two modes per frontend/backend:

- **`mode http`**: HAProxy parses every request, understands URL/method/headers/cookies. Can route based on URL, rewrite headers, terminate TLS, do sticky sessions.
- **`mode tcp`**: HAProxy treats traffic as opaque bytes — pure L4 forwarding. No parsing, lower CPU, works for any protocol.

For log shippers (Beats, Syslog, Kafka) the answer is always **TCP mode**: the wire protocols aren't HTTP, and we don't need any L7 features. Just distribute connections.

## 4. Load-balancing algorithms

The `balance` directive in a backend block decides which server gets the next connection:

| Algorithm    | Behavior                                                              | When to use                                              |
| ------------ | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `roundrobin` | Each new connection goes to the next server in the list               | Default. Works when workers are equally powerful.        |
| `leastconn`  | New connection goes to the server with the fewest active connections  | When session duration varies a lot                       |
| `source`     | Hash client IP → consistent server (stickiness without cookies)       | When you need affinity but the protocol is plain TCP     |
| `random`     | Pure random pick                                                      | Rare — useful when you want to spread without state      |

For Beats traffic, **`roundrobin`** is the textbook choice. Beats connections are long-lived (a single TCP socket stays open for minutes), and Logstash workers are stateless — any worker can process any event. There's no upside to anything fancier here.

## 5. Health checks

A backend server is only used if HAProxy considers it healthy. Two probe styles:

- **TCP**: open a TCP connection to `server:port`, close it. If it accepts, the server is up. Enabled with `option tcp-check`.
- **HTTP**: `GET /health` (or any URL you choose), expect a 2xx. Enabled with `option httpchk`.

For Beats backends, TCP is enough — Logstash either listens on `:5044` or it doesn't; there's no separate health endpoint to query.

The probe cadence is tuned with `default-server`:

```haproxy
default-server inter 5s fall 3 rise 2
```

Reads as: probe every `5s`, mark a server DOWN after `3` consecutive failures (15 s), mark it UP again after `2` consecutive successes (10 s).

## 6. The stats endpoint

HAProxy ships with a built-in HTML/CSV stats UI that shows every frontend/backend's connection count, byte counters, server status, error rates, and per-session response time histograms. Enable it on a dedicated frontend:

```haproxy
frontend stats
    bind *:8404
    mode http
    stats enable
    stats uri /
    stats refresh 10s
```

Then `http://<haproxy-host>:8404/` (in a browser) or `curl http://<haproxy-host>:8404/;csv` (for programmatic checks) gives you live visibility into the LB layer. This page should exist in every HAProxy deployment — it's the first thing you'll look at when debugging.

## 7. Timeouts

This is the **most common source of bugs** in HAProxy setups that forward long-lived TCP. The relevant timeouts in the `defaults` section:

| Timeout           | Default | What it controls                                                       |
| ----------------- | ------- | ---------------------------------------------------------------------- |
| `timeout connect` | none    | TCP connect timeout to a backend server                                 |
| `timeout client`  | none    | How long to keep an idle client connection                              |
| `timeout server`  | none    | Same, for the upstream side                                             |
| `timeout tunnel`  | larger of client/server | Maximum lifetime of a forwarded TCP tunnel              |
| `timeout check`   | varies  | Cap on the duration of a single health check                            |

> [!IMPORTANT]
> For log shippers, **set client/server/tunnel to 24h**. The Debian/Ubuntu default `timeout client 1m` will kill long-lived Beats TCP sessions every 60 seconds, producing a constant reconnect storm in the producer logs. Hours can be spent debugging this exact symptom because the reconnects "work" — they just shouldn't be happening.

## 8. Common pitfalls

> [!WARNING]
> **`mode tcp` without `option tcplog`** only logs a line when a session terminates — which for long-lived Beats sessions can be hours later. Always add `option tcplog` in a TCP frontend; it logs each session with byte counts and a state code, far more useful for diagnosing live traffic.

> [!WARNING]
> **`option dontlognull`** drops log lines for sessions that never sent/received bytes (probes, port scanners, broken clients). Without it, the log is full of noise.

> [!INFO]
> **`server <name> <ip>:<port>` is hardcoded** — HAProxy resolves the hostname *once* at config-reload time, not at every connection. If your backends are DNS names with dynamic IPs (Kubernetes Service, Docker), you need a `resolvers` block to keep the resolution live. For static IPs (typical in this lab) this isn't a concern.

> [!TIP]
> **Validate the config before reloading.** `haproxy -c -f /etc/haproxy/haproxy.cfg` parses without applying. A syntax error during a live reload causes HAProxy to keep running the OLD config silently; you only notice when a `server` line drops mysteriously.

## 9. The HA layer above HAProxy

A single HAProxy is, of course, a single point of failure and does not allow for any traffic distribution, nor has a queue system like Kafka or RabbitMQ. 

To make at least the LB layer redundant, you need a separate component that:

1. monitors which HAProxy instance is alive,

2. owns a **Virtual IP (VIP)** that clients target, and migrates it to the surviving node on failure.

There are two mainstream schools for doing this on Linux.

### 9.1 Lightweight: HAProxy + Keepalived (this lab)

Two HAProxy instances on two hosts, both running the same config, plus **Keepalived** on each host implementing **VRRP**. Clients always target the VIP; whichever HAProxy currently owns it serves the traffic; if that node dies, the VIP migrates to the standby within ~3 seconds.

- HAProxy itself runs **active-active at process level** (both daemons are always up), but the VIP is **active-passive** — only one node receives traffic at a time.

- Minimal configuration, no quorum, no fencing. Split-brain is theoretically possible under a network partition, but for a stateless LB in front of stateless workers the blast radius is small.

- Covered end-to-end in [[networking/miscellaneous/keepalived-vrrp|keepalived-vrrp]].

This is what the lab uses — the standard open-source recipe for "highly-available HAProxy".

### 9.2 Enterprise alternative: HAProxy + Pacemaker + Corosync

In larger environments (and most commercial distributions with HA add-ons — Red Hat HA, SUSE HAE) HAProxy is fronted by a full cluster manager instead of Keepalived:

- **Corosync** — the messaging / membership layer. Handles "who's in the cluster, who's reachable, do we have quorum". Doesn't manage any resource on its own.

- **Pacemaker** — the resource manager that sits on top of Corosync. Treats both the VIP (`ocf:heartbeat:IPaddr2`) and HAProxy itself (`systemd:haproxy`) as **cluster resources**, with explicit dependencies, colocation, and ordering rules.

The trade-off vs. Keepalived:

| Aspect | Keepalived (lab) | Pacemaker + Corosync (enterprise) |

| ------------------- | --------------------------- | ---------------------------------------------- |

| Protocol | VRRP (L2 multicast) | Corosync totem ring (UDP) |

| Resources managed | VIP only (+ check scripts) | Anything (VIP, services, mounts, …) |

| Quorum / fencing | None | Native quorum + STONITH |

| Configuration | A few dozen lines | `pcs` / `crm` tooling, much more articulated |

| Vendor support | Community only | Red Hat HA, SUSE HAE, … |

When you choose this path you get stronger guarantees against split-brain (fencing is mandatory), the ability to express things like *"if haproxy dies on node A, migrate the VIP to node B **and** restart haproxy there"*, and integration with an HA stack you may already have for databases or shared storage. The cost is operational complexity: more daemons, more config, steeper learning curve.

> [!INFO]
> **About "Heartbeat".** You may hear this stack referred to generically as *Heartbeat*, especially in older docs or from veteran sysadmins. Historically Heartbeat was the original Linux-HA daemon (pre-2009) that did both messaging and resource management; the project later split into **Corosync** (messaging) + **Pacemaker** (resource manager). The Heartbeat daemon still exists as a legacy messaging layer but is rarely used in new deployments — modern clusters are Corosync-based. Treat "Heartbeat" as the name of the *concept / legacy stack*, not of a current component (the `ocf:heartbeat:*` resource agent namespace is a naming leftover from those years).

---

## 10. In this lab

Two HAProxy instances on `loglb01` (`10.0.0.11`) and `loglb02` (`10.0.0.12`), behind a shared VIP at `10.0.0.10` managed by Keepalived. Each HAProxy listens on:

- **`:5044`** — Beats input. Filebeat clients (on the producer side) send events here.
- **`:8404`** — stats UI, private network only.

The backend pool is the two Logstash workers, `logstash01` (`10.0.0.21`) and `logstash02` (`10.0.0.22`), distributed round-robin with TCP health checks.

### 10.1 The configuration file

`/etc/haproxy/haproxy.cfg` — **identical on both loglb01 and loglb02**:

```haproxy
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    log     global
    mode    tcp
    option  dontlognull
    timeout connect 5s
    timeout client  24h
    timeout server  24h
    timeout tunnel  24h
    timeout check   5s

# ─────────────────────────────────────────────────────────
# Stats UI on :8404 — private network only
# Browse http://<lb-ip>:8404/ to see live backend status
# ─────────────────────────────────────────────────────────
frontend stats
    bind *:8404
    mode http
    stats enable
    stats uri /
    stats refresh 10s

# ─────────────────────────────────────────────────────────
# Beats input on :5044 — round-robin to Logstash workers
# ─────────────────────────────────────────────────────────
frontend beats_in
    bind *:5044
    mode tcp
    option tcplog
    default_backend logstash_pool

backend logstash_pool
    mode tcp
    balance roundrobin
    option tcp-check
    default-server inter 5s fall 3 rise 2
    server logstash01 10.0.0.21:5044 check
    server logstash02 10.0.0.22:5044 check
```

### 10.2 Line-by-line commentary

- **`global`** block: standard daemon setup. Log forwarding to syslog via `/dev/log` (UNIX socket), chroot for isolation, drop privileges to the unprivileged `haproxy` user.
- **`defaults` → `mode tcp`**: the entire instance defaults to TCP. The stats frontend later overrides this to `mode http` for the dashboard.
- **`defaults` → `timeout client/server/tunnel 24h`**: the critical setting for long-lived Beats connections. With the package default of `1m` you'd see Filebeat reconnect every minute, polluting the logs.
- **`frontend stats`** on `:8404`: the HTML/CSV stats UI. In TCP mode it would be opaque, so this single frontend overrides to `mode http`.
- **`frontend beats_in`** on `:5044`: the actual Beats receiver. `option tcplog` ensures each session is logged with byte counts and a state code on close.
- **`backend logstash_pool`**:
  - `balance roundrobin` distributes connections one-by-one across `logstash01` and `logstash02`.
  - `option tcp-check` says "probe by opening a TCP socket" — no Beats handshake, just a connect.
  - `default-server inter 5s fall 3 rise 2` applies to both `server` lines: probe cadence is 5 s, mark DOWN after three failures (15 s), mark UP after two successes (10 s).
  - The two `server` lines define the named upstreams. `check` enables health probing for each.

### 10.3 Install and bring it up

```bash
# On both loglb01 and loglb02
sudo apt update
sudo apt install -y haproxy

# Drop the config above into /etc/haproxy/haproxy.cfg
sudo nano /etc/haproxy/haproxy.cfg

# Validate before applying — never skip this
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
# Output: "Configuration file is valid"

# Enable + start
sudo systemctl enable --now haproxy
sudo systemctl status haproxy --no-pager | head -5
```

### 10.4 Verify the pool

From any host on the private network:

```bash
curl -s "http://10.0.0.11:8404/;csv" | awk -F',' '
  NR==1 { print "frontend/backend  svname        scur  bin       bout      status"; next }
  $1=="beats_in" || $1=="logstash_pool" {
    printf "%-17s %-13s %-5s %-9s %-9s %s\n", $1, $2, $5, $9, $10, $18
  }'
```

Expected output once Logstash workers are up:

```
frontend/backend  svname        scur  bin       bout      status
beats_in          FRONTEND      0     0         0         OPEN
logstash_pool     logstash01    0     0         0         UP
logstash_pool     logstash02    0     0         0         UP
logstash_pool     BACKEND       0     0         0         UP
```

As Filebeat clients connect, `scur` (current sessions) and `bin/bout` (byte counters) start moving. If a Logstash worker dies, its row flips to `DOWN` within ~15 s and `scur` redistributes to the survivors.

### 10.5 Reload after config changes

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg && sudo systemctl reload haproxy
```

A clean reload doesn't drop existing connections — HAProxy spawns the new process, drains the old one gracefully.

## Where to go next

- [[networking/miscellaneous/keepalived-vrrp|keepalived-vrrp]] — **next in this series**: the VRRP layer that owns the VIP and migrates it between loglb01 and loglb02 on failure.

- [[observability/logs/filebeat/filebeat-setup|filebeat-setup]] — coming later in the series: the producer that will push Beats traffic into this VIP.

Back-reference: [[observability/logs/logstash/logstash-setup|logstash-setup]] is the worker pool this LB distributes to — already deployed earlier in the series.