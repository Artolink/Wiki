---
title: "Keepalived and VRRP: make HA real"
---

## What is Keepalived

**Keepalived** is a Linux daemon that implements **VRRP** (Virtual Router Redundancy Protocol) and a health-check engine, so you can build active/standby (or active/active with multiple VIPs) high availability for any IP-based service.

In plain words: it takes two or more identical Linux boxes, picks one as the active node, gives it an **extra IP address** (the *virtual IP* or VIP), and keeps the others in standby. If the active node disappears, one of the standbys takes over the VIP within seconds, and clients reach the service at the same address as before.

What you get from Keepalived (vs. a custom failover script):
- A **standards-based protocol** (VRRP, RFC 5798) for the election: well-understood, multicast or unicast, fast.
- **Health checks** (`vrrp_script`) that automatically lower a node's priority when something is wrong (e.g. HAProxy is down on this node), triggering a graceful failover.
- **Notify hooks** that run scripts on state transitions (`master`, `backup`, `fault`), so you can run extra cleanup or notification logic.

In our setup, Keepalived sits beside HAProxy on lb01 and lb02. HAProxy provides backend-side HA (multiple Logstash workers behind one VIP); Keepalived provides frontend-side HA (the VIP itself survives if a whole LB box dies).

## Core concepts

### Virtual Router

A "virtual router" in VRRP terms is a group of physical hosts that collectively own a single IP (the VIP). At any moment, exactly one host in the group is the **master** and serves traffic on the VIP; the rest are **backups** standing by.

The group is identified by a numeric `virtual_router_id` (1-255), which **must be unique on the LAN segment** (if two unrelated VRRP groups share the same id, they'll interfere — frequent cause of "weird failover").

### Master election

Each node has a `priority` (1-254). The node with the highest priority becomes master. If the master goes silent (no VRRP adverts for ~3× `advert_int`), the next-highest-priority backup takes over.

By default, **preemption is on**: if a higher-priority node comes back, it takes over from a lower-priority master. You can turn this off with `nopreempt` to avoid flapping.

### Adverts and timing

The master sends VRRP advertisement packets at every `advert_int` seconds (default: 1s). The backup considers the master dead if it misses ~3 in a row. So failover latency is `~3 * advert_int = 3s` by default.

### Multicast vs unicast

VRRP traditionally uses **multicast** (224.0.0.18). On Tailscale and many cloud networks multicast doesn't work, so you must use **unicast** mode: every peer is listed explicitly with `unicast_peer { ... }`. Slower to configure, more reliable in modern networks.

### Tracking scripts

A `vrrp_script` is a small command that runs periodically. If it exits non-zero, Keepalived decreases the node's priority by `weight`. So you can wire "is HAProxy alive on this node?" to the election: if HAProxy crashes on the master, its priority drops below the backup's, the backup takes over.

```
vrrp_script chk_haproxy {
    script "killall -0 haproxy"      # exit 0 if process exists
    interval 2
    weight  -20                       # drop priority by 20 if check fails
}
```

### Notify hooks

`notify_master`, `notify_backup`, `notify_fault` run a script when the node enters that state. Common uses: send an alert, page on-call, restart a dependent service, log the event somewhere persistent.

## Common patterns

### Active/standby (most common)

Two nodes, same VRID, one with higher priority. The high-priority node is always master under normal conditions; the other is in standby. Default behaviour, suitable for any service that doesn't benefit from being run on multiple nodes simultaneously.

### Active/active with two VIPs

Two VRRP groups (two VRIDs), two VIPs. Node A is master for VRID 1, backup for VRID 2; node B is master for VRID 2, backup for VRID 1. Both nodes serve traffic, but each VIP is on exactly one node. If A fails, B takes over both VIPs. Doubles the throughput in steady state.

### Authenticated VRRP

Set `authentication { auth_type PASS; auth_pass <shared-secret>; }`. Protects against random hosts joining the VRRP group on the same LAN. Considered insecure cryptographically (it's a plaintext password) but blocks accidents.

### Sync groups

Multiple `vrrp_instance` blocks bound together in a `vrrp_sync_group`. They all transition together: if one becomes master, the others do too. Useful when several VIPs must live on the same node (e.g. an external VIP and an internal VIP for the same service).

## Pitfalls

> [!WARNING] Things that will bite you
> - **`virtual_router_id` clash on the same LAN**: if two unrelated Keepalived setups use the same VRID on the same broadcast domain, they think they're the same group. They start fighting for the VIP. Pick a unique VRID per LAN.
> - **Multicast on cloud/overlay networks**: most cloud VPCs and overlay networks (Tailscale, WireGuard mesh, Docker bridge networks) don't forward multicast. Use `unicast_peer` everywhere. If you see "I'm master" on both nodes simultaneously, multicast is the first suspect.
> - **Preemption flapping**: with `preempt` on (default) and a flaky master node, you can get rapid back-and-forth. If the master keeps coming and going, set `nopreempt` and a higher `preempt_delay`.
> - **Tracking script returning unexpectedly**: a `vrrp_script` that fails because of a typo or transient issue (e.g. DNS hiccup) will trigger an unintended failover. Keep scripts simple, idempotent, and fast.
> - **Split-brain on network partition**: if lb01 and lb02 can't see each other but both are still reachable by clients, both think they're master and both take the VIP. Clients see ARP confusion. Single-LAN setups rarely hit this; over WAN/VPN it's a real risk. Mitigate with witness nodes or quorum-based tools (Pacemaker) when stakes are high.
> - **Notify scripts and Keepalived's environment**: notify hooks run as the user Keepalived runs as (often root), with a very minimal environment. Hardcode full paths, set `PATH` explicitly, redirect output to a log so you can debug.
> - **VIP must be in the host's subnet**: the VIP doesn't have to be configured on any interface in the OS, but it must be **routable** from clients. Cloud providers usually require you to pre-reserve the VIP as a "secondary IP" or "alias IP" on the instance, otherwise the network silently drops traffic to it.

## In this lab

We run Keepalived on lb01 (priority 100) and lb02 (priority 90), unicast mode (Tailscale doesn't multicast), single VRID, single VIP. The VIP is the address Filebeat is configured to ship to. A tracking script checks HAProxy health and drops priority if HAProxy is missing on a node.

```keepalived
# /etc/keepalived/keepalived.conf on lb01

global_defs {
    router_id LB01
    enable_script_security
    script_user keepalived_script
}

vrrp_script chk_haproxy {
    script "/usr/bin/killall -0 haproxy"
    interval 2
    fall 2
    rise 2
    weight -20
}

vrrp_instance VI_BEATS {
    state MASTER                # initial state hint
    interface tailscale0        # the interface the VIP will live on
    virtual_router_id 51        # unique on this Tailscale network
    priority 100                # higher than lb02 → lb01 is the preferred master
    advert_int 1
    nopreempt                   # don't flap if lb02 is currently master and lb01 comes back

    unicast_src_ip 100.x.x.10   # lb01's Tailscale IP
    unicast_peer {
        100.x.x.11              # lb02's Tailscale IP
    }

    authentication {
        auth_type PASS
        auth_pass <change-me-shared>
    }

    virtual_ipaddress {
        100.x.x.50/32 dev tailscale0   # the VIP Filebeat targets
    }

    track_script {
        chk_haproxy
    }

    notify_master "/etc/keepalived/notify.sh master"
    notify_backup "/etc/keepalived/notify.sh backup"
    notify_fault  "/etc/keepalived/notify.sh fault"
}
```

The lb02 config is **identical except**: `state BACKUP`, `priority 90`, `unicast_src_ip` is lb02's Tailscale IP, `unicast_peer` lists lb01.

The notify script logs every state change (so you can grep `journalctl` for failover events):

```bash
#!/bin/bash
# /etc/keepalived/notify.sh

logger -t keepalived "Node became $1 for VI_BEATS at $(date)"
```

After `sudo systemctl restart keepalived` on both nodes, you should see:

```sh
# On lb01:
ip -br addr show tailscale0
# tailscale0 ... 100.x.x.10/32 100.x.x.50/32   ← VIP is here
```

```sh
# On lb02:
ip -br addr show tailscale0
# tailscale0 ... 100.x.x.11/32                  ← no VIP (it's on lb01)
```

> [!TIP]
> Verify failover end-to-end:
> 1. On lb01, `systemctl stop haproxy`. The tracking script fails, priority drops to 80, lb02 wins the election (still at 90).
> 2. On lb02: `ip -br addr show tailscale0` now shows the VIP.
> 3. `journalctl -t keepalived` on both nodes records the transition.
> 4. Filebeat keeps shipping (the destination IP hasn't changed, just the host serving it).

## Where to go next

- Next in the series: **[[logstash/_index|Logstash]]** — the workers behind the load balancer.
- Keepalived has more advanced features that we don't use here but are worth knowing: BGP-based VRRP, sync groups for multi-VIP setups, gratuitous ARP tuning, VRRPv3, IPv6 VIP. The official `keepalived.conf(5)` man page is the canonical reference.