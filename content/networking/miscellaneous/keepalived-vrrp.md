---
title: "Keepalived and VRRP: make HA real"
---
---

This page is the companion to [[observability/logs/load-balancers/haproxy-for-logs|haproxy-for-logs]]. 

HAProxy gives us horizontal scaling of the worker pool behind it; it does **not** make the load balancer itself redundant. A single HAProxy is still a single point of failure. The standard fix is to run **two HAProxy hosts** sharing a **Virtual IP (VIP)** that migrates between them automatically. The mechanism is Keepalived, implementing the VRRP protocol.

Same shape as the HAProxy page: generic reference first, the exact lab configuration last.

## 1. What is Keepalived?

Keepalived is an open-source daemon that does two related jobs:

1. **VRRP** (RFC 5798) — election and ownership of a Virtual IP shared across a group of hosts. Exactly one host in the group "owns" the VIP at any moment; if that host dies, ownership migrates to another within a few seconds.
2. **Health-check + automatic failover** — periodic probes of local services (HAProxy in our case). If the local service is unhealthy, Keepalived lowers its priority so that ownership of the VIP migrates to the standby.

The combination gives a transparent active/standby HA pair: clients hit the VIP, and the underlying instance answering them changes invisibly.

## 2. VRRP, in 60 seconds

VRRP is a protocol that runs between routers (or generic hosts) on a shared layer-2 segment. Each VRRP "instance" defines:

- A **Virtual Router ID** (VRID) — a number 1-255 that identifies the group on the segment
- A set of participating hosts (routers), each with a **priority** value
- A **Virtual IP** that the group collectively owns

The participating hosts send periodic **VRRP advertisements** to each other (multicast group 224.0.0.18, IP protocol 112). The host with the highest priority wins the election and becomes **MASTER** — it claims the VIP, responds to ARP for it, and serves traffic. The others sit in **BACKUP** state, listening for the master's heartbeat. If the master stops advertising for `3 × advert_int` seconds, the highest-priority backup promotes itself to MASTER, attaches the VIP to its own interface, and sends a **gratuitous ARP** so the switch fabric updates its MAC tables.

The whole failover takes **~3 seconds** on a healthy LAN.

## 3. Core configuration concepts

### 3.1 `vrrp_instance` block

The heart of the config. One block per VIP being managed.

```text
vrrp_instance VI_NAME {
    state         MASTER       # initial role on this host
    interface     eth0         # interface where the VIP lives
    virtual_router_id 51       # VRID (1-255, must match on all peers)
    priority      110          # election weight
    advert_int    1            # heartbeat period (seconds)
    authentication { ... }
    virtual_ipaddress { ... }
    track_script { ... }
}
```

### 3.2 `state` and `priority`

- `state MASTER` on the active host, `state BACKUP` on the standby. This is just the **initial** state — election happens at startup and may reassign roles based on `priority`.
- `priority` is what really decides who wins. Highest priority host becomes MASTER. A common convention: **110 on the active, 100 on the standby** (10-point gap to allow `weight` tracking adjustments without flapping).

### 3.3 `virtual_router_id`

A number 1-255 that identifies this VRRP group on the segment. **All peers in the same group MUST use the same VRID**, and the VRID **MUST be unique among VRRP groups on the same L2 segment**. Collisions cause two unrelated groups to silently fight over the same VIP.

### 3.4 `advert_int`

Heartbeat period in seconds (default 1). Failover detection time is `3 × advert_int` (~3 s by default). Lowering to fractions (`advert_int 0.5`) tightens failover at the cost of more CPU/bandwidth.

### 3.5 `authentication`

VRRP supports two auth modes:

- **`PASS`**: a shared password (max 8 chars). Weak, but enough to prevent accidental cross-group collisions.
- **`AH`**: IPsec-style auth header. Stronger but rarely used; many implementations don't support it well.

Always set authentication, even on private networks — it prevents an accidental misconfigured neighbor from joining your VRRP group.

### 3.6 `virtual_ipaddress`

The VIP itself, with CIDR. The MASTER attaches this to the configured `interface` when it claims ownership; the BACKUP doesn't have it. Multiple VIPs per instance are allowed.

```text
virtual_ipaddress {
    10.0.0.10/24
}
```

### 3.7 `track_script`

A reference to a `vrrp_script` block that periodically runs a command and adjusts priority based on its exit code. The standard pattern: track whether HAProxy is running on the local host. If `pgrep haproxy` fails, drop priority by N and the standby takes over.

```text
vrrp_script chk_haproxy {
    script    "/usr/bin/pgrep -x haproxy"
    interval  2      # run every 2s
    weight   -20     # subtract 20 from priority on failure
    fall      2      # need 2 consecutive failures to count
    rise      2      # need 2 consecutive successes to recover
}

vrrp_instance VI_LOGS {
    ...
    priority 110
    track_script {
        chk_haproxy
    }
}
```

With `priority 110` on the active and `priority 100` on the standby: if HAProxy on the active dies, weight `-20` drops the effective priority to 90 → standby (100) wins → VIP migrates.

## 4. Multicast vs unicast

The default VRRP transport is **multicast** on `224.0.0.18`. This works on any L2 segment that allows multicast — i.e. almost any physical LAN, almost no cloud VPC.

If multicast is unavailable (most public cloud networks filter it), Keepalived supports **unicast mode**: each peer sends advertisements as plain unicast to the others' IPs.

```text
vrrp_instance VI_LOGS {
    ...
    unicast_src_ip 10.0.0.11
    unicast_peer {
        10.0.0.12
    }
}
```

Same protocol, same election logic — just `224.0.0.18` replaced by direct peer IPs. Slightly higher per-peer config (you have to list each peer explicitly) but works in routed environments where multicast doesn't.

## 5. Common pitfalls

> [!IMPORTANT]
> **VRID must be unique on the L2 segment.** If another VRRP group on the same broadcast domain (some other application, a router redundancy pair, a colleague's lab) uses the same VRID, the two groups silently merge and you get unpredictable VIP ownership. Always check `tcpdump -i eth0 vrrp` to confirm no foreign advertisements before picking a VRID.

> [!WARNING]
> **`auth_pass` is limited to 8 characters** for the PASS method. Longer passwords are silently truncated — and asymmetric truncation across peers causes them to ignore each other's adverts entirely, leading to a split-brain.

> [!INFO]
> **Interface names matter.** `interface eth0` must be the actual interface where the L2 segment lives. On modern Ubuntu/Debian with predictable names (`enp1s0`, `enx12345...`) the name will differ from `eth0`. Mismatches between peers cause one node to send VRRP on the wrong NIC and never see the other's heartbeats.

> [!TIP]
> **Always set `enable_script_security` + `script_user`** in `global_defs`. Without these, Keepalived 2.0+ refuses to run user-defined `vrrp_script` (security default). The minimum block looks like:
> ```
> global_defs {
>     enable_script_security
>     script_user root
> }
> ```

> [!WARNING]
> **Preemption is on by default.** When the original MASTER recovers, it takes the VIP back from the BACKUP, causing a second failover. If your service can't tolerate the brief glitch, add `nopreempt` to the `vrrp_instance` to make the standby keep the VIP until it itself fails.

## 6. Verification commands

The classics:

```bash
# State of each VRRP instance on this host (Keepalived 2.x exposes /tmp/keepalived.data on SIGUSR1)
sudo killall -SIGUSR1 keepalived
sudo cat /tmp/keepalived.data | grep -A2 "VRRP Instance"

# Or via journal: every state transition is logged
journalctl -u keepalived --no-pager -n 20 | grep -E "STATE|MASTER|BACKUP"

# Does the host have the VIP attached right now?
ip addr show | grep 10.0.0.10

# tcpdump the heartbeat
sudo tcpdump -i eth0 -n vrrp
```

---

## 7. In this lab

Two HAProxy hosts: `loglb01` (`10.0.0.11`, the default MASTER) and `loglb02` (`10.0.0.12`, the BACKUP). Both run Keepalived. They share a VIP `10.0.0.10/24`. Clients (Filebeat producers) target the VIP; whichever HAProxy currently owns it serves them. A `vrrp_script` checks that the local HAProxy process is alive — if it dies, Keepalived lowers the local priority so the peer wins the election.

VRID `51`, authentication password is 8 hex chars (generated with `openssl rand -hex 4`).

### 7.1 Master config — loglb01

`/etc/keepalived/keepalived.conf` on `loglb01`:

```text
global_defs {
    enable_script_security
    script_user root
    router_id loglb01
}

# Health check: kill the local priority if HAProxy stops running
vrrp_script chk_haproxy {
    script "/usr/bin/pgrep -x haproxy"
    interval 2
    weight  -20
    fall     2
    rise     2
}

vrrp_instance VI_LOGS {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 110
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass <8-char-secret>
    }

    virtual_ipaddress {
        10.0.0.10/24
    }

    track_script {
        chk_haproxy
    }
}
```

### 7.2 Backup config — loglb02

`/etc/keepalived/keepalived.conf` on `loglb02`. **Identical** to loglb01 with two changes: `state BACKUP`, `priority 100`, and `router_id loglb02`.

```text
global_defs {
    enable_script_security
    script_user root
    router_id loglb02
}

vrrp_script chk_haproxy {
    script "/usr/bin/pgrep -x haproxy"
    interval 2
    weight  -20
    fall     2
    rise     2
}

vrrp_instance VI_LOGS {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass <same-8-char-secret>
    }

    virtual_ipaddress {
        10.0.0.10/24
    }

    track_script {
        chk_haproxy
    }
}
```

### 7.3 Line-by-line commentary

- **`global_defs`**: `enable_script_security` + `script_user root` are required for `vrrp_script` to execute under modern Keepalived. `router_id` is a string used only for logging — useful to distinguish which host is logging what.
- **`vrrp_script chk_haproxy`**: checks the local process every 2 s. `weight -20` says "subtract 20 from priority while the check fails". With master = 110 and backup = 100, a HAProxy crash on the master lowers it to 90 → backup (100) wins.
- **`state MASTER` / `BACKUP`**: just the initial role, doesn't actually decide who wins.
- **`virtual_router_id 51`**: chosen arbitrarily, must match on both peers, must not collide with any other VRRP group on this L2.
- **`priority 110` / `100`**: the real election weights. 10-point gap leaves headroom for the `-20` track-script adjustment.
- **`auth_pass`**: same 8-char value on both peers. Set with `openssl rand -hex 4` to get a clean ASCII secret.
- **`virtual_ipaddress 10.0.0.10/24`**: the VIP. Note the `/24` matches the LAN's CIDR — important for ARP resolution to work correctly.
- **`track_script { chk_haproxy }`**: ties the health-check to the priority adjustment.

### 7.4 Install and bring it up

```bash
# Both loglb01 and loglb02
sudo apt update
sudo apt install -y keepalived

# Drop the config above into /etc/keepalived/keepalived.conf
sudo nano /etc/keepalived/keepalived.conf
sudo chmod 600 /etc/keepalived/keepalived.conf

# Validate before applying
sudo keepalived -t -f /etc/keepalived/keepalived.conf
# Silent output = valid

# Enable + start
sudo systemctl enable --now keepalived
sleep 3
sudo systemctl status keepalived --no-pager | head -6
```

### 7.5 Verify election and VIP ownership

```bash
# On loglb01 — should be MASTER, owns the VIP
journalctl -u keepalived -n 10 --no-pager | grep -E "STATE|MASTER|BACKUP"
ip addr show eth0 | grep 10.0.0.10

# On loglb02 — should be BACKUP, no VIP attached
journalctl -u keepalived -n 10 --no-pager | grep -E "STATE|MASTER|BACKUP"
ip addr show eth0 | grep 10.0.0.10 && echo "✗ VIP attached on BACKUP (split-brain)" || echo "✓ no VIP on BACKUP (correct)"
```

Expected journal lines:

```
loglb01 Keepalived_vrrp: (VI_LOGS) Entering BACKUP STATE (init)
loglb01 Keepalived_vrrp: (VI_LOGS) Entering MASTER STATE
loglb02 Keepalived_vrrp: (VI_LOGS) Entering BACKUP STATE (init)
```

(Both nodes start in BACKUP, then loglb01 promotes itself within 3 s because it sees no MASTER with higher priority.)

### 7.6 Test failover

Stop HAProxy on the master and confirm the VIP migrates:

```bash
# On loglb01
sudo systemctl stop haproxy
date -u +%T

# Check ~5 s later on loglb02
ip addr show eth0 | grep 10.0.0.10   # should now show the VIP
journalctl -u keepalived -n 5 --no-pager | grep "MASTER STATE"
```

Expected: loglb02 enters MASTER STATE within ~5 s of the HAProxy stop, attaches `10.0.0.10/24` to `eth0`, sends gratuitous ARP. Clients on the L2 segment see no interruption beyond the brief gap.

Recover:

```bash
# On loglb01
sudo systemctl start haproxy

# Within ~5 s, loglb01 wins the election back (priority 110 vs 100)
# and the VIP migrates back. Add `nopreempt` to the loglb02 config
# if you'd rather have it keep the VIP — saves one extra glitch.
```

## Where to go next

- [[observability/logs/load-balancers/haproxy-for-logs|haproxy-for-logs]] — the load balancer that sits inside this VRRP pair.
- [[observability/logs/logstash/logstash-setup|logstash-setup]] — the workers that HAProxy distributes traffic to.
- Tighten the failover detection time by lowering `advert_int` to `0.5` (fractional seconds) if your network can tolerate 2× the VRRP heartbeat traffic.