---
title: "Linux upgrade: 01-system-snapshot.sh"
---


```bash
#!/bin/bash
set -euo pipefail

# =========================================================
# Pre-upgrade snapshot
# Captures system state into a timestamped directory.
# =========================================================

SNAP="/root/pre-upgrade-$(date +%F-%H%M)"
mkdir -p "$SNAP" && cd "$SNAP"

echo "[+] Collecting system info..."

# ---------- System identity ----------
{
    echo "=== hostnamectl ==="     ; hostnamectl
    echo                            ; echo "=== /etc/os-release ===" ; cat /etc/os-release
    echo                            ; echo "=== uname -a ==="        ; uname -a
    echo                            ; echo "=== uptime ==="          ; uptime
} > sysinfo.txt

# ---------- Held packages ----------
apt-mark showhold > holds.txt

# ---------- Services ----------
{
    echo "=== systemctl --failed ==="
    systemctl --failed
    echo
    echo "=== inactive services ==="
    systemctl list-units --type=service --all | grep inactive || true
} > services.txt

# ---------- Storage / mounts ----------
{
    echo "=== findmnt ==="    ; findmnt
    echo                       ; echo "=== /etc/fstab ===" ; cat /etc/fstab
} > storage.txt

# ---------- Network ----------
{
    echo "=== ip -br -c a ==="
    ip -br -c a
    echo
    echo "=== /etc/netplan ==="
    cat /etc/netplan/*.yaml 2>/dev/null || true
    echo
    echo "=== iptables -nvL ==="
    iptables -nvL || true
    echo
    echo "=== iptables -t nat -nvL ==="
    iptables -t nat -nvL || true
} > network.txt

# ---------- /etc backup ----------
# Compressed archive of /etc so that, if apt overwrites a config file
# during the upgrade (the Y/I/N/O/D/Z prompt), we have a pristine copy
# to diff and restore from. Saved inside $SNAP for a single self-
# contained pre-upgrade folder; 2>/dev/null swallows benign warnings
# about /etc/.pwd.lock or sockets that change mid-archive.
echo "[+] Backing up /etc ..."
tar -czf etc.tar.gz /etc 2>/dev/null || true

echo
echo "[+] Snapshot saved to: $SNAP"
ls -lah "$SNAP"
```

What each file gives you back later:

- **`sysinfo.txt`** — distro/kernel version + uptime. The "before" line of any post-mortem.
- **`holds.txt`** — packages explicitly held back. Empty is fine; non-empty means those holds need to survive the upgrade.
- **`services.txt`** — failed and inactive services *as they are right now*. Critical: if a service is already failed before the upgrade, you don't want to chase it as a regression afterwards.
- **`storage.txt`** — runtime mounts vs persistent `fstab`. A discrepancy is a red flag worth investigating *before* the reboot, not after.
- **`network.txt`** — interfaces, netplan, firewall rules. Iptables especially: Docker recreates its chains on every restart, but your custom rules don't come back unless `netfilter-persistent` survived the upgrade.
