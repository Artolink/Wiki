---
title: "Patch management: a safe apt upgrade procedure"
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

##  The maintenance script

### What it does, step by step

The script runs everything inside a **detached `screen` session** (so it survives an SSH disconnect) and captures every line of output to a log file you can tail in real time.

Before the upgrade starts, it takes a **safety backup of the iptables rules** (both v4 and v6) and a copy of `/etc/iptables`, so that if `netfilter-persistent` is touched by the upgrade you have a clean copy to restore from.

Then the actual upgrade flow goes through 9 phases:

| Step | What | Why |
|---|---|---|
| **1** | `apt update` with fail-fast | If the package index can't refresh, don't upgrade against stale data. |
| **2** | Save `apt list --upgradable` to a file | Before/after diff if something breaks. |
| **3** | `apt upgrade` in conservative mode (`--force-confold` + `--force-confdef`) | Don't overwrite your customised config files. |
| **4** | `apt full-upgrade` | Accepts package removals & dependency transitions (where new kernels usually arrive). |
| **5** | `dpkg --configure -a` + `apt -f install -y` | Idempotent repair of any interrupted dpkg state. |
| **6** | `apt autoremove --purge` + `apt clean` | Evicts old kernels (prevents `/boot` from filling) and reclaims disk. |
| **7** | SSH safety validation (`sshd -t` + `restart` + `is-active` + `is-enabled`) | Confirms SSH will actually come back up after a reboot. |
| **8** | Kernel diagnostics (`uname -r`, `ls /boot`) | Post-mortem reference: which kernel ran, which one is now installed, which fallback exists. |
| **9** | `netfilter-persistent` check + reinstall if missing | Makes sure firewall rules load at next boot. |

Finally:

- **Safety gate**: if step 7 didn't fully pass, the script **refuses to reboot**, prints diagnostics, and exits.
- **Conditional reboot**: it reboots **only if `/var/run/reboot-required` exists** (i.e. only if a package — typically the kernel — actually needs it). No reboot, no downtime.

>[!IMPORTANT]
>The script is opinionated: it picks the safe defaults for *patch* management (small, frequent updates), not for *release* upgrades (Ubuntu 22.04 → 24.04 and similar). For those, see the [release upgrade guide](linux-release-upgrade) (coming soon).

### The script: 02-patch-upgrade.sh

```sh
#!/bin/sh

############################################################
# SYSTEM MAINTENANCE SCRIPT
# (UYUNI / CLI + SCREEN + FULL LOGGING + SAFE REBOOT)
############################################################

# Minute-granularity timestamp: two runs in the same hour won't
# overwrite each other's logs (which would happen with %Y%m%d%H).
TS=$(date +%Y%m%d%H%M)
SESSION="maintenance_${TS}"

# Snapshot of upgradable packages (pre-upgrade state)
LOGFILE="/root/updates_AVAILABLE_PACKAGES_${TS}.log"
# Full execution log (stdout + stderr of every step)
EXEC_LOG="/root/maintenance_FULL_RUN_${TS}.log"
# Safety backup folder: iptables rules + copy of /etc/iptables.
# Kept under /root so it survives even if /etc is damaged.
BACKUP_DIR="/root/maintenance_backup_${TS}"
mkdir -p "$BACKUP_DIR"

############################################################
# SAFETY BACKUP — BEFORE TOUCHING ANYTHING
#
# If the upgrade touches netfilter-persistent / iptables-persistent
# and something goes wrong (auto-removal, damaged config), having
# a snapshot of the current rules lets us restore without having
# to rebuild the firewall from memory.
# All silent (2>/dev/null): if ip6tables isn't installed, we
# don't want noisy errors here.
############################################################
iptables-save  > "$BACKUP_DIR/rules.v4.bak"     2>/dev/null
ip6tables-save > "$BACKUP_DIR/rules.v6.bak"     2>/dev/null
cp -a /etc/iptables "$BACKUP_DIR/etc-iptables"  2>/dev/null

# The variables above must be visible to the screen sub-shell.
# We export them: the quoted heredoc below does NOT expand $VAR,
# so without export the inner bash would see them empty.
export TS LOGFILE EXEC_LOG BACKUP_DIR

############################################################
# START SCREEN SESSION
#
# Quoted heredoc (<<'SCRIPT'): no expansion done by the outer
# shell on the body. All $VAR are resolved by the inner bash
# at runtime, exactly as expected. No more traps like
# "$SSH_OK expanded too early" silently disabling the safety gate.
############################################################
screen -dmS "$SESSION" bash <<'SCRIPT'

# Capture all script output to the log file.
exec > "$EXEC_LOG" 2>&1

echo '############################################################'
echo "# START MAINTENANCE SESSION - $TS"
echo "# full log:      $EXEC_LOG"
echo "# pkg snapshot:  $LOGFILE"
echo "# safety backup: $BACKUP_DIR"
echo '############################################################'

############################################################
# [1/9] APT UPDATE (fail-fast)
#
# If the index refresh fails (repo down, broken DNS, proxy
# password rotation, ...) there's no point continuing: we'd
# be upgrading against a stale index. Abort immediately.
############################################################
echo '[1/9] apt update'
if ! apt update; then
    echo 'FATAL: apt update failed, aborting'
    exit 1
fi

############################################################
# [2/9] SNAPSHOT THE LIST OF PACKAGES TO UPGRADE
#
# Useful for the "before vs after" diff and, in case of a
# regression later, to identify the prime suspect package.
############################################################
echo '[2/9] saving upgradable packages snapshot'
apt list --upgradable > "$LOGFILE" 2>/dev/null
echo "Snapshot saved to: $LOGFILE"

############################################################
# [3/9] APT UPGRADE — CONSERVATIVE MODE
#
# - DEBIAN_FRONTEND=noninteractive: zero prompts, script won't stall.
# - --force-confold + --force-confdef: on a config-file conflict,
#   dpkg keeps the EXISTING version (yours) instead of overwriting
#   it with the upstream default. Saves nginx/sshd/etc. from
#   silently reverting to defaults after an upgrade.
# - apt upgrade BEFORE full-upgrade: "two-pass". upgrade doesn't
#   remove packages; full-upgrade accepts removals. Doing the
#   conservative pass first minimises edge cases.
############################################################
echo '[3/9] apt upgrade (safe mode)'
DEBIAN_FRONTEND=noninteractive apt upgrade \
  -o=Dpkg::Options::=--force-confold \
  -o=Dpkg::Options::=--force-confdef \
  -y

############################################################
# [4/9] APT FULL-UPGRADE — kernel + dependency transitions
#
# This step handles what upgrade can't: it removes obsolete
# packages and installs transitions (e.g. libfoo1 → libfoo2).
# It's usually where new kernels land.
############################################################
echo '[4/9] apt full-upgrade (kernel + dependency changes)'
DEBIAN_FRONTEND=noninteractive apt full-upgrade \
  -o=Dpkg::Options::=--force-confold \
  -o=Dpkg::Options::=--force-confdef \
  -y

############################################################
# [5/9] DPKG/APT CONSISTENCY REPAIR
#
# If anything above failed half-way (flaky network, /boot full,
# broken package, lockfile), dpkg ends up in "interrupted" state
# and every subsequent apt refuses to start until repaired.
#
# Both commands below are IDEMPOTENT: if nothing's broken, they
# do nothing. Leaving them in is free insurance.
############################################################
echo '[5/9] dpkg/apt consistency repair'
dpkg --configure -a
DEBIAN_FRONTEND=noninteractive apt -f install -y

############################################################
# [6/9] AUTOREMOVE + CLEAN
#
# - autoremove --purge: removes old kernels and orphan deps
#   (packages no longer needed). CRUCIAL on Ubuntu: /boot is
#   ~1 GB and after 3-4 kernel upgrade cycles it fills up,
#   causing the next kernel upgrade to fail mid-way.
# - apt clean: empties /var/cache/apt/archives/ — immediate
#   disk space reclaim.
############################################################
echo '[6/9] autoremove + clean'
DEBIAN_FRONTEND=noninteractive apt autoremove --purge -y
apt clean

############################################################
# [7/9] SSH SAFETY VALIDATION (4 COMBINED CHECKS)
#
# "is-enabled" alone is NOT enough: it tells you "will start
# at boot" but not whether sshd actually works RIGHT NOW.
# Sequence of tests:
#   1. sshd -t                → sshd_config is syntactically valid
#   2. is-enabled ssh         → the unit is enabled at boot
#   3. systemctl restart ssh  → it ACTUALLY restarts now (live
#                                test, so you don't find out at
#                                reboot that sshd was broken)
#   4. is-active ssh          → it's effectively up after restart
#
# If any of these fails → SSH_OK=0 → NO REBOOT below.
# A patched-but-reachable machine beats a clean-but-unreachable one.
############################################################
echo '[7/9] SSH safety validation'
SSH_OK=0
if sshd -t 2>/dev/null \
   && systemctl is-enabled ssh >/dev/null 2>&1 \
   && systemctl restart ssh \
   && systemctl is-active ssh >/dev/null 2>&1; then
    SSH_OK=1
    echo 'SSH: config valid, enabled, restarted, active'
else
    echo 'SSH: validation FAILED — dumping diagnostics'
    sshd -t
    systemctl status ssh --no-pager || true
fi

############################################################
# [8/9] KERNEL INFO (post-mortem reference)
#
# Knowing which kernel is running and which ones are in /boot
# helps to (a) check if the upgrade installed a new one and
# (b) confirm that /boot has a working fallback in case of a
# GRUB-side rollback.
############################################################
echo '[8/9] kernel diagnostics'
echo "Running kernel: $(uname -r)"
echo 'Installed kernels in /boot:'
ls -l /boot | grep vmlinuz || true

############################################################
# [9/9] NETFILTER-PERSISTENT CHECK
#
# The iptables rules are already snapshotted outside this
# screen (in $BACKUP_DIR). Here we only check if the package
# that loads them at boot still exists — if the upgrade
# removed it, we reinstall it.
############################################################
echo '[9/9] netfilter-persistent check'
systemctl status netfilter-persistent.service --no-pager || true

if ! command -v netfilter-persistent >/dev/null 2>&1; then
    echo 'netfilter-persistent missing -> reinstalling iptables-persistent'
    DEBIAN_FRONTEND=noninteractive apt-get install \
        --reinstall iptables-persistent -y
fi

############################################################
# [FINAL] SAFETY GATE BEFORE REBOOT
#
# This is THE check that prevents locking ourselves out of
# the machine. With the quoted-heredoc fix in place, it now
# works as intended.
############################################################
echo '[FINAL] safety gate before reboot'
if [ "$SSH_OK" -ne 1 ]; then
    echo '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
    echo 'CRITICAL FAILURE: SSH NOT SAFE'
    echo 'ABORTING REBOOT TO PREVENT LOCKOUT'
    echo '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
    exit 1
fi

############################################################
# REBOOT — ONLY IF ACTUALLY REQUIRED
#
# /var/run/reboot-required is created by the packages that
# need it (new kernel, libc, sometimes openssl/dbus).
# If it's not there, we skip the reboot — no pointless downtime.
############################################################
if [ -f /var/run/reboot-required ]; then
    echo 'reboot required by these packages:'
    cat /var/run/reboot-required.pkgs 2>/dev/null
    echo 'rebooting now'
    reboot
else
    echo 'no reboot required by this upgrade — skipping'
fi

echo 'END OF MAINTENANCE'

SCRIPT
```

Save it as `02-patch-upgrade.sh`, `chmod +x`, run as root.

##  Monitoring the run

The script returns control to the prompt **immediately** because it runs inside a detached `screen`. To see what it's actually doing:

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

Useful if you want to *interact* with the script (in normal flow you don't need to — the script is fully unattended).

### Watch the system as it changes

In a **second SSH session** (always keep one open as your "safety" session, in case the main one gets killed by the upgrade):

```sh
journalctl -f                                  # system log, live
watch -n 5 'systemctl --failed'                # failed services, refreshed every 5s
watch -n 5 'df -hT /boot /'                    # /boot filling up = bad news
ss -tn state established '( sport = :22 )'     # active SSH sessions
dmesg -w                                       # kernel events in real time
```

>[!TIP]
>If `/boot` jumps from 60% to 95% during the upgrade, kill the maintenance and run `apt autoremove --purge` from another shell before resuming. It's the most common cause of mid-upgrade failure.

### Tips for the smoothest monitoring

- **Always have two SSH sessions open**, never just one. If the upgrade restarts `sshd` aggressively and kills your session, the second one is your lifeline.
- **Keep the hypervisor / cloud panel open in a browser tab**. If the safety gate triggers and SSH is gone anyway (extremely rare with this script, but possible), the snapshot rollback is one click away.
- **Watch your monitoring tool** (Nagios, CheckMK, Zabbix, PRTG): the host should *not* go red — you put it in downtime in step 5 of the pre-upgrade checks, didn't you? If something *does* alert, that's a real symptom worth checking even before the upgrade ends.
- **Don't reboot manually**. The script decides whether to reboot based on `/var/run/reboot-required`. If you reboot first, you skip the SSH safety gate.

##  After the upgrade

When the reboot completes (or doesn't, if no reboot was needed), the machine is on the new packages — but the job isn't done yet. The system needs to be **verified**: confirm the right kernel is running, all services came back up, nothing in `services.txt` from the pre-upgrade snapshot has regressed.

We'll cover all of that in the dedicated [post-upgrade checks](linux-post-upgrade-checks) page (coming soon).