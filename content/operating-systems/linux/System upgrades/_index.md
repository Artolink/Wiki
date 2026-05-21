---
title: ⬆️ System upgrades
tags:
  - Maintenance
fullseries:
---

Linux systems need to be kept up to date. 

This section covers **how to do it safely** in production: from the daily security patches all the way to a full distribution release upgrade, plus verification and rollback procedures.

Here are some scenarios to help you out:

- **It's your first time updating a production server?** Read all of them in order.
- **Weekly security patches on a normal server?** start at `Pre-upgrade checks`, then `Patch management`, then `Post-upgrade checks`.
- **Major distro upgrade?** start at `Pre-upgrade checks`, then `Release upgrade`, then `Post-upgrade checks`.
- **Something went wrong** → jump to `Upgrade rollback`.

> [!Warning] IMPORTANT
> **These guides are generic and cover the OS-level upgrade only.** 
> 
> There are also many specific cases where additional steps are required, for example:
>
> | Role | What to do first |
> |---|---|
> | **Kubernetes node** | `kubectl cordon <node>` then `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data` |
> | **OpenStack compute** | Live-migrate every VM to another host |
> | **Ceph OSD node** | `ceph osd set noout` + drain OSDs |
> | **Replicated database** (Patroni, Galera, MongoDB RS…) | Failover the primary, drain client connections |
> | **Load balancer in active-passive pair** (HAProxy + keepalived…) | Failover to the standby |
> | **Pacemaker / Corosync cluster member** | `pcs node standby <node>` |
> | **App server in a pool behind a LB** | Drain from the load balancer |
>



