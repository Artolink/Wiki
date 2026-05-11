---
title: "Linux upgrade: 00-server-recon.sh"
---


```bash
#!/bin/bash

set -uo pipefail

# =========================================================
# Server recon script
# "Outside-in" walkthrough of an unknown production box.
# Read-only: nothing on disk gets modified.
# Output goes into the same pre-upgrade folder as the
# snapshot script, with a `recon-` prefix so files don't
# collide if you run both back-to-back.
# =========================================================

SNAP="/root/pre-upgrade-$(date +%F-%H%M)"
mkdir -p "$SNAP"
cd "$SNAP"

echo "[+] Recon snapshot — saving to: $SNAP"

# =========================================================
# README — what each file is for
# =========================================================
cat > recon-README.txt <<EOF
Server recon snapshot
Generated: $(date)
Host:      $(hostname -f 2>/dev/null || hostname)

Files:
  recon-exposure.txt    — public-facing: IP, reverse DNS, open ports,
                          firewall rules, certificates on disk
  recon-running.txt     — services, timers, processes, containers, VMs
  recon-packages.txt    — manually installed packages, /opt, /usr/local,
                          custom systemd units
  recon-users.txt       — login history, current sessions, real users,
                          sudoers, /home, recently edited /etc files
  recon-storage.txt     — filesystem usage + biggest top-level dirs +
                          /var/lib breakdown (where stateful data lives)
  recon-scheduled.txt   — system cron, per-user cron, systemd timers
  recon-recent.txt      — warnings in the last 24h, recently written logs
EOF

# =========================================================
# EXPOSURE — what the world sees
# =========================================================
{
    echo "=== ip -br -c a ==="
    ip -br -c a

    echo
    echo "=== Public IP (best-effort via ifconfig.me) ==="
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || true)
    echo "${PUBLIC_IP:-(unavailable — no internet or curl missing)}"

    echo
    echo "=== Reverse DNS of public IP ==="
    if [ -n "${PUBLIC_IP:-}" ]; then
        host "$PUBLIC_IP" 2>&1 || echo "(no PTR record)"
    else
        echo "(skipped — public IP unknown)"
    fi

    echo
    echo "=== iptables -nvL ==="
    iptables -nvL 2>&1 || echo "(iptables not available)"

    echo
    echo "=== iptables -t nat -nvL ==="
    iptables -t nat -nvL 2>&1 || true

    echo
    echo "=== Certificates found in /etc /opt /usr/local ==="
    find /etc /opt /usr/local -type f \
        \( -name "*.crt" -o -name "*.pem" -o -name "*.cer" -o -name "*.key" \) \
        2>/dev/null || true

    echo
    echo "=== ss -tulpn (listening sockets + program) ==="
    ss -tulpn
} > recon-exposure.txt

# =========================================================
# RUNNING — what's currently doing work
# =========================================================
{
    echo "=== systemctl list-units --type=service --state=running ==="
    systemctl list-units --type=service --state=running --no-pager

    echo
    echo "=== systemctl list-timers --all ==="
    systemctl list-timers --all --no-pager

    echo
    echo "=== ps auxf (process tree) ==="
    ps auxf

    echo
    echo "=== docker ps -a ==="
    docker ps -a 2>/dev/null || echo "(docker not installed)"

    echo
    echo "=== docker images ==="
    docker images 2>/dev/null || true

    echo
    echo "=== virsh list --all ==="
    virsh list --all 2>/dev/null || echo "(libvirt not installed)"

    echo
    echo "=== lxc list ==="
    lxc list 2>/dev/null || echo "(lxd not installed)"
} > recon-running.txt

# =========================================================
# PACKAGES — what was installed on purpose
# =========================================================
{
    echo "=== apt-mark showmanual ==="
    apt-mark showmanual 2>/dev/null || echo "(apt-mark not available — not a Debian/Ubuntu box?)"

    echo
    echo "=== ls -la /opt ==="
    ls -la /opt 2>/dev/null || true

    echo
    echo "=== ls -la /usr/local/bin /usr/local/sbin ==="
    ls -la /usr/local/bin /usr/local/sbin 2>/dev/null || true

    echo
    echo "=== /etc/systemd/system/*.service (custom unit files) ==="
    ls -la /etc/systemd/system/*.service 2>/dev/null || echo "(no custom unit files)"
} > recon-packages.txt

# =========================================================
# USERS — who has used / can use this box
# =========================================================
{
    echo "=== last -n 30 (recent logins) ==="
    last -n 30 2>/dev/null || true

    echo
    echo "=== who (active sessions) ==="
    who

    echo
    echo "=== real users (UID >= 1000) ==="
    getent passwd | awk -F: '$3 >= 1000'

    echo
    echo "=== sudo group members ==="
    getent group sudo 2>/dev/null || true
    getent group wheel 2>/dev/null || true
    getent group admin 2>/dev/null || true

    echo
    echo "=== ls -la /home ==="
    ls -la /home 2>/dev/null || true

    echo
    echo "=== most recently edited files in /etc ==="
    ls -lt /etc | head -20
} > recon-users.txt

# =========================================================
# STORAGE — where the data lives
# =========================================================
{
    echo "=== df -hT ==="
    df -hT

    echo
    echo "=== top-level dirs by size (du -x -d1 /) ==="
    # -x = stay on one filesystem (skip /proc, /sys, /dev, network mounts)
    du -h -x -d1 / 2>/dev/null | sort -h

    echo
    echo "=== /var/lib breakdown (where stateful services keep data) ==="
    du -h -d1 /var/lib 2>/dev/null | sort -h
} > recon-storage.txt

# =========================================================
# SCHEDULED — what runs without a human pressing enter
# =========================================================
{
    echo "=== system-level cron drop-in directories ==="
    ls -la /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly /etc/cron.d 2>/dev/null

    echo
    echo "=== /etc/crontab ==="
    cat /etc/crontab 2>/dev/null || true

    echo
    echo "=== per-user crontabs ==="
    for u in $(cut -f1 -d: /etc/passwd); do
        out=$(crontab -u "$u" -l 2>/dev/null) || continue
        if [ -n "$out" ]; then
            echo "--- $u ---"
            echo "$out"
            echo
        fi
    done

    echo
    echo "=== systemctl list-timers --all ==="
    systemctl list-timers --all --no-pager
} > recon-scheduled.txt

# =========================================================
# RECENT — what's been going on lately
# =========================================================
{
    echo "=== journalctl --since '24 hours ago' -p warning ==="
    journalctl --since "24 hours ago" -p warning --no-pager 2>/dev/null || true

    echo
    echo "=== ls -lt /var/log/ | head -20 (logs most recently written) ==="
    ls -lt /var/log/ | head -20
} > recon-recent.txt

# =========================================================
# Done
# =========================================================
echo
echo "[+] Recon snapshot complete:"
ls -lah "$SNAP"/recon-*
```