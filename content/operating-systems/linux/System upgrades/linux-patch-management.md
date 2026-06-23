---
title: "1. Patch management: a safe apt upgrade procedure"
tags:
  - Maintenance
---

##  Before we start

Before you touch `apt`, make sure you've gone through the [pre-upgrade checks](linux-pre-upgrade-checks). 

Tick them off:

- [ ] 1. Understand the server's role
- [ ] 2. Create a snapshot
- [ ] 3. Save the current system state
- [ ] 4. Run pre-flight checks
- [ ] 5. Extras (rollback plan, scheduled downtime in your monitoring tool...)

If all of these are done, you're ready. 

Otherwise, do them first: this guide assumes the safety net is already in place.

## What we want to achieve

A patch upgrade should be:

- **Unattended**: no interactive prompt should block it mid-way.
- **Conservative**: configuration files you've customised should *not* be silently overwritten.
- **Resilient**: a flaky network or a half-broken state from a previous attempt shouldn't leave the system unusable.
- **Reversible**: if SSH dies, you must not reboot blindly into a machine you can't reach anymore.

The full procedure below is a single shell script that does exactly this. Read it once and you'll know what to expect every time you run it.

##  <input type="checkbox"> The scripted procedure

### What it does

The script runs everything inside a **detached `screen` session** (so it survives an SSH disconnect) and captures every line of output to a log file you can tail in real time.

Before the upgrade starts, it takes a **safety backup of the iptables rules** (both v4 and v6) and a copy of `/etc/iptables`, so that if `netfilter-persistent` is touched by the upgrade you have a clean copy to restore from.

Then the actual upgrade flow goes through 9 phases:

| Step | What | Why |
|---|---|---|
| **1** | `apt update` with fail-fast | If the package index can't refresh, don't upgrade against stale data. |
| **2** | Save `apt list --upgradable` to a file | Before/after diff if something breaks. |
| **3** | `apt autoremove --purge` + `apt clean` (PRE) | Frees `/boot` and disk space *before* the upgrade installs new packages — preventing the most common mid-upgrade failure (`/boot` full = new kernel install fails halfway). |
| **4** | `apt upgrade` in conservative mode (`--force-confold` + `--force-confdef`) | Don't overwrite your customised config files. |
| **5** | `apt full-upgrade` | Accepts package removals & dependency transitions (where new kernels usually arrive). |
| **6** | `dpkg --configure -a` + `apt -f install -y` | Idempotent repair of any interrupted dpkg state. |
| **7** | SSH safety validation (`sshd -t` + `restart` + `is-active` + `is-enabled`) | Confirms SSH will actually come back up after a reboot. |
| **8** | Kernel diagnostics (`uname -r`, `ls /boot`) | Post-mortem reference: which kernel ran, which one is now installed, which fallback exists. |
| **9** | `netfilter-persistent` check + reinstall if missing | Makes sure firewall rules load at next boot. |

Finally:

- **Safety gate**: if step 7 didn't fully pass, the script **refuses to reboot**, prints diagnostics, and exits.
- **Conditional reboot**: it reboots **only if `/var/run/reboot-required` exists** (i.e. only if a package (typically the kernel) actually needs it). No reboot, no downtime.

### Script: 02-patch-upgrade.sh


> [!warning]- Generic procedure: not enough for every situation!
> This is a **generic OS-level checklist**: It's perfect as-is for nodes without critical services.
>
> For example, for nodes hosting **databases** (Redis, PostgreSQL, MySQL/Galera, MongoDB…), **load balancers** (HAProxy, keepalived), or any **quorum/replica/cluster**-based system (etcd, RabbitMQ, Patroni, Ceph…), this procedure is **not sufficient on its own**: it must be combined with a technology-specific procedure applied *on top of this*, handling at least:
> - **Node ordering**: e.g. replica → replica → master, to avoid losing quorum
> - **Controlled failover**: hand over the primary role *before* patching instead of taking it at reboot
> - **`apt-mark hold` on the service package**: sometimes you don't want to upgrade critical services together with the OS (e.g. DBs most of the time have their own dedicated procedure)
> - **Application-level health checks (pre/post)**: replication state, sync, quorum, service version...

Here is the actual [patch upgrade script](02-patch-upgrade.sh), just save it as `02-patch-upgrade.sh`, `chmod +x` and run it as root.

But if you don't feel confident and prefer to do the actual procedure manually, here are the steps:

```bash
screen -dmS maintenance
screen -r maintenance

# Safety backup of iptables
iptables-save  > /root/rules.v4.bak
ip6tables-save > /root/rules.v6.bak 2>/dev/null
cp -a /etc/iptables /root/etc-iptables-bak 2>/dev/null

# Refresh index and see what's coming
apt update
apt list --upgradable

# If there's anything you don't want to update (e.g. DBs)
apt-mark hold <PACKAGE_NAME> # and "apt-mark unhold <PACKAGE_NAME>" at the end
apt-mark showhold

# Also, if you need to launch a full-upgrade but you have packages on hold, make sure to verify their dependencies too, since a full-upgrade can remove them
apt-cache rdepends --installed <PACKAGE_NAME>

# Pre-upgrade cleanup
apt autoremove
apt clean

# Pre-upgrade dry-run
apt-get -s upgrade
apt-get -s full-upgrade

# Upgrade
DEBIAN_FRONTEND=noninteractive apt upgrade -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef -y
DEBIAN_FRONTEND=noninteractive apt full-upgrade -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef -y

# Repair any interrupted state (idempotent)
dpkg --configure -a
apt -f install

# SSH validation before any reboot
sshd -t
systemctl restart ssh # ALWAYS
systemctl is-enabled ssh # If not: systemctl enable ssh
systemctl is-active ssh # If not: systemctl restart ssh again

# Kernel diagnostics
uname -r
ls -l /boot | grep vmlinuz

# netfilter-persistent check
command -v netfilter-persistent && systemctl status netfilter-persistent.service --no-pager # if missing: apt install --reinstall iptables-persistent

# Reboot only if required
[ -f /var/run/reboot-required ] && cat /var/run/reboot-required.pkgs
reboot
```

##  <input type="checkbox"> Monitoring the run

The script returns control to the prompt **immediately** because it runs inside a detached `screen`. 

To see what it's actually doing:

### Tail the log

```sh
tail -f /root/maintenance_FULL_RUN_*.log
```

This is the easiest way: every step prints a `[N/9]` header, so you always know where it is.

### Reattach to the screen session

```sh
screen -ls                          # see if the maintenance session is still running
screen -r maintenance_<timestamp>   # reattach (Ctrl+A then D to detach again)
```

Useful if you want to *interact* with the script (in normal flow you don't need to, the script is fully unattended.

### Watch the system as it changes

In a **second SSH session** (always keep one open as your "safety" session, in case the main one gets killed by the upgrade):

```sh
journalctl -f                                  # system log, live
watch -n 5 'systemctl --failed'                # failed services, refreshed every 5s
watch -n 5 'df -hT /boot /'                    # /boot filling up = bad news
ss -tn state established '( sport = :22 )'     # active SSH sessions
dmesg -w                                       # kernel events in real time
```

> [!TIPS]
> - **Always have two SSH sessions open**, never just one. If the upgrade restarts `sshd` aggressively and kills your session, the second one is your lifeline.
>- **Keep the hypervisor / cloud panel open in a browser tab**: if the safety gate triggers and SSH is gone anyway (extremely rare with this script, but possible), the snapshot rollback is one click away.
>- **Always keep an eye to your monitoring tool** (Nagios, CheckMK, Zabbix, PRTG) for alerts.
>- **Don't reboot manually**: the script decides whether to reboot based on `/var/run/reboot-required`. If you reboot first, you skip the SSH safety gate.


##  After the upgrade

When the reboot completes (or doesn't, if no reboot was needed), the machine is on the new packages... but the job isn't done yet. 

The system needs to be **verified**: confirm the right kernel is running, all services came back up, nothing in `services.txt` from the pre-upgrade snapshot has regressed.

We'll cover all of that in the dedicated [post-upgrade checks](linux-post-upgrade-checks) page (coming soon).