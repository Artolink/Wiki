---
title: "Linux upgrade: 02-patch-upgrade.sh"
---
**What the script does:**

- Runs unattended inside a **`screen`** session with full **timestamped logging**: survives an SSH disconnect.

- **Safety backup first**: `iptables`/`ip6tables` rules + `/etc/iptables` (firewall restorable if the upgrade breaks it).

- **`apt update`** (fail-fast) + snapshots the upgradable packages for a before/after diff.

- **Pre-upgrade cleanup**: `autoremove --purge` + `apt clean` to free `/boot` and the apt cache.

- **Two-pass upgrade**: `apt upgrade` then `full-upgrade`, fully non-interactive, **keeping your existing config files** (`--force-confold/confdef`).

- **Self-repairs** any interrupted dpkg/apt state (`dpkg --configure -a`, `apt -f install`)

- **SSH validation** before doing anything risky: config test → enabled → live restart → active.

- Logs **kernel** info and checks **`netfilter-persistent`** (reinstalls it if the upgrade removed it).

- **Reboots only if** a reboot is actually required **and** SSH passed validation, otherwise it **aborts to avoid lockout**.

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
# [3/9] AUTOREMOVE + CLEAN — PRE-UPGRADE CLEANUP
#
# Run BEFORE the upgrade to free /boot (autoremove removes
# unreferenced old kernels) and /var/cache/apt/archives/
# (apt clean). On Ubuntu /boot is ~1 GB and after 3-4 kernel
# upgrade cycles it can fill up — if there's no room when the
# new kernel arrives, the install fails halfway and leaves
# dpkg in an inconsistent state. Preventing here = no
# half-broken upgrades.
#
# The running kernel and the newest installed are always
# protected by apt — autoremove never touches them.
############################################################
echo '[3/9] autoremove + clean (free disk space before upgrade)'
DEBIAN_FRONTEND=noninteractive apt autoremove --purge -y
apt clean

############################################################
# [4/9] APT UPGRADE — CONSERVATIVE MODE
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
echo '[4/9] apt upgrade (safe mode)'
DEBIAN_FRONTEND=noninteractive apt upgrade \
  -o=Dpkg::Options::=--force-confold \
  -o=Dpkg::Options::=--force-confdef \
  -y

############################################################
# [5/9] APT FULL-UPGRADE — kernel + dependency transitions
#
# This step handles what upgrade can't: it removes obsolete
# packages and installs transitions (e.g. libfoo1 → libfoo2).
# It's usually where new kernels land.
############################################################
echo '[5/9] apt full-upgrade (kernel + dependency changes)'
DEBIAN_FRONTEND=noninteractive apt full-upgrade \
  -o=Dpkg::Options::=--force-confold \
  -o=Dpkg::Options::=--force-confdef \
  -y

############################################################
# [6/9] DPKG/APT CONSISTENCY REPAIR
#
# If anything above failed half-way (flaky network, /boot full,
# broken package, lockfile), dpkg ends up in "interrupted" state
# and every subsequent apt refuses to start until repaired.
#
# Both commands below are IDEMPOTENT: if nothing's broken, they
# do nothing. Leaving them in is free insurance.
############################################################
echo '[6/9] dpkg/apt consistency repair'
dpkg --configure -a
DEBIAN_FRONTEND=noninteractive apt -f install -y

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