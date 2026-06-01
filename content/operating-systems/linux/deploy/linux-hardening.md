---
title: "Linux server hardening: a practical CIS-aligned baseline for Debian / Ubuntu"
tags:
  - Maintenance
  - Advanced
---
> [!abstract] Ansible automation
> If you'd rather automate this instead of applying it by hand, this entire guide is available as a ready-to-run [[linux-hardening-playbook|Ansible playbook]].

The following is a practical baseline for hardening a **fresh Debian or Ubuntu server**. 

It consolidates the CIS Level 1 server controls, with a set of additional measures (auditing, kernel and filesystem hardening, brute-force protection, automatic security updates, firewall) that are commonly omitted, but very valuable in production.

The guide is split into two parts:

1. **Overview**: what hardening is, the philosophy, and how to use this document.
2. **Implementation**: concrete configuration, grouped by area, ready to be adapted into Ansible, shell scripts, or applied by hand.

---

## 1. Overview

### 1.1 What is hardening?

System hardening is the process of reducing a machine's attack surface and increasing the cost of a successful compromise. 

It rests on a few principles:

- **Least privilege**: users, services, and files get only the access they strictly need.
- **Defense in depth**: multiple independent layers, so one failure does not equal total compromise.
- **Reduce attack surface**: remove unused packages, services, ports, kernel modules, and protocols.
- **Auditability**: generate and protect logs so that intrusions can be detected and investigated.
- **Secure defaults**: make the safe configuration the default state of the machine.

The **CIS Benchmarks** (published by the [Center for Internet Security](https://www.cisecurity.org/cis-benchmarks)) are the *de-facto* industry baseline for secure system configuration: hundreds of pages of concrete, prescriptive rules covering ~140 platforms (operating systems, databases, web servers, cloud, container runtimes).

Each Benchmark splits its controls into two profiles: this guide targets **Level 1** (practical, prudent, no significant loss of functionality) and adds selected **Level 2 / defense-in-depth** items only where the cost is low.

### 1.3 How to read the implementation sections

Each control is presented with:

- **What**: the change being made.
- **Why**: the risk it mitigates.
- **How**: the commands or configuration.
- **Verify**: how to confirm it is applied.

### 1.4 Order of operations

A sensible sequence when applying these to a fresh machine:

1. Package cleanup and required tooling (§2)
2. Kernel modules and filesystem types disable (§3)
3. Kernel and network parameters via sysctl (§4)
4. Firewall (§5)
5. Filesystem mount options (§6)
6. SSH server hardening (§7)
7. PAM, password, and account policy (§8)
8. Sudo hardening (§9)
9. Auditing (§10)
10. Logging (§11)
11. Brute-force protection (§12)
12. Automatic security updates (§13)
13. Banners, MOTD, and shell environment (§14)
14. Mandatory Access Control / AppArmor (§15)
15. Final verification and compliance scan (§16)

> [!CAUTION]
> Several changes (SSH, PAM, sudo, firewall) can lock you out if applied incorrectly. 
> 
> **Always keep a second authenticated session open** while applying them, and test login from a new session before closing the old one. 
> 
> For the firewall, allow your management IP / SSH first, *then* enable the default-deny policy.

### 1.5 What hardening does NOT protect you from

> [!IMPORTANT]
> This guide reduces the probability and blast radius of a **remote** or **lateral-movement** compromise. 
> 
> It does **not** protect against:
>
> - **Accidental or malicious data loss**: You need **encrypted backups**. The open-source tool I use in production is **BareOS**.
> - **Physical access** to the disk: you need **full-disk encryption (LUKS)** on laptops and bare-metal servers, without it, anyone with 30 seconds at the disk can mount it from a live USB and read `/etc/shadow`, application data, and TLS private keys in clear (Cloud VPS are out of scope, the trust boundary is the provider's hypervisor, and you've already accepted it).
> - **Application-layer vulnerabilities** in the software the server actually runs.


---

## 2. Packages and Services

### 2.1 Remove unnecessary packages

**What:** Remove software not needed on a server.
**Why:** Every installed package is a potential vulnerability and part of the attack surface.

Safe-to-remove candidates on a typical server:

```bash
apt-get purge -y \
  rsh-client rsh-redone-client \
  talk \
  nis \
  ldap-utils \
  xinetd

# GUI / X11 components (servers do not need them)
apt-get purge -y 'xserver-xorg*'

apt-get autoremove --purge -y
```

> [!WARNING]
> **Do NOT blindly purge** `snapd` and `multipath-tools`, they're sometimes flagged in CIS lists but:
> - `snapd` on Ubuntu may be a dependency of `lxd`, cloud-init bootstraps, and some vendor agents.
> - `multipath-tools` is **mandatory** on SAN/iSCSI/Fibre-Channel storage: removing it can render disks invisible after the next reboot.
>
> Verify your environment first (`snap list`, `multipath -l`) before removing either.

### 2.2 Install required tooling

**What:** Install logging, time sync, auditing, and update tooling.

```bash
apt-get update
apt-get install -y \
  rsyslog \
  chrony \
  auditd audispd-plugins \
  unattended-upgrades apt-listchanges \
  fail2ban \
  libpam-pwquality libpam-modules \
  ufw
```

### 2.3 Disable unneeded services

**What:** Stop and disable services that are installed but not required.

```bash
# Example: a mail transfer agent not needed on most app servers
systemctl disable --now postfix 2>/dev/null || true
```

**Verify:**

```bash
systemctl list-unit-files --state=enabled
```

### 2.4 Time synchronization

**What:** Ensure a single, working time source.
**Why:** Consistent timestamps are essential for log correlation and much more.

`/etc/chrony/chrony.conf`:

```conf
pool 2.debian.pool.ntp.org iburst
driftfile /var/lib/chrony/chrony.drift
makestep 1.0 3
rtcsync
```

```bash
systemctl enable --now chrony
chronyc tracking
```

---

## 3. Kernel modules and filesystem types

**What:** Block the loading of kernel modules that have no business being on a server.
**Why:** Many filesystem drivers (`cramfs`, `udf`, ...) and removable-media stacks (`usb-storage`, `firewire-core`) expand the kernel attack surface for zero operational benefit on a typical Linux server. 

### 3.1 Disable unused filesystem modules

`/etc/modprobe.d/cis-filesystem.conf`:

```conf
install cramfs    /bin/true
install freevxfs  /bin/true
install jffs2     /bin/true
install hfs       /bin/true
install hfsplus   /bin/true
install udf       /bin/true
# squashfs left enabled — snapd / appimage use it
```

Then unload anything already in memory:

```bash
for m in cramfs freevxfs jffs2 hfs hfsplus udf; do
  modprobe -r "$m" 2>/dev/null || true
done
```

### 3.2 Disable USB storage (optional)

**What:** Block the kernel module that backs USB mass-storage devices.
**Why:** Stops an attacker with physical access from exfiltrating data or auto-running malware from a USB key. Skip if the server legitimately uses USB drives.

`/etc/modprobe.d/cis-usb.conf`:

```conf
install usb-storage /bin/true
```

### 3.3 Disable wireless interfaces (optional)

**What:** Disable Wi-Fi / Bluetooth radios on a wired-only server.
**Why:** Removes an entire wireless attack surface on machines that have no business broadcasting.

```bash
# Wireless: if `rfkill list` shows entries, block all
rfkill block all

# Bluetooth daemon
systemctl disable --now bluetooth 2>/dev/null || true
```

**Verify:**

```bash
lsmod | grep -E 'cramfs|udf|hfs|usb_storage|btusb'   # should be empty
```

---

## 4. Kernel and Network Parameters (sysctl)

**What:** Apply secure kernel and network tunables.
**Why:** Disables routing/redirect behaviors a server should not have, mitigates spoofing and several local information leaks, and enables exploit mitigations (ASLR, ptrace scope, kernel pointer hiding).

Create `/etc/sysctl.d/20-hardening.conf`:

```conf
# ─── Network: routing & redirects ─────────────────────────
net.ipv4.ip_forward = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0

# ─── Network: source routing ──────────────────────────────
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# ─── Network: spoofing & anti-DoS ─────────────────────────
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# ─── IPv6 (apply equivalents if IPv6 IS used; see callout) ──
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
net.ipv6.conf.all.forwarding = 0

# ─── Kernel: exploit mitigations & info leaks ─────────────
kernel.randomize_va_space = 2
fs.suid_dumpable = 0
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.perf_event_paranoid = 3
kernel.yama.ptrace_scope = 1

# ─── Filesystem: link & FIFO protections ──────────────────
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.protected_fifos = 2
fs.protected_regular = 2
```

Apply and verify:

```bash
sysctl --system
sysctl net.ipv4.ip_forward          # -> 0
sysctl kernel.randomize_va_space    # -> 2
sysctl kernel.yama.ptrace_scope     # -> 1
```

> [!INFO]
> **About IPv6.** This guide hardens IPv6 but does *not* disable it. Disabling IPv6 system-wide breaks Docker / Podman, NetworkManager, systemd-resolved. CIS L1 does not require disabling IPv6, only hardening it. If you have a documented reason to disable it, do so via the bootloader:
>
> ```conf
> # /etc/default/grub
> GRUB_CMDLINE_LINUX="ipv6.disable=1"
> ```
>
> ```bash
> update-grub
> ```

---

## 5. Firewall

**What:** Default-deny incoming, default-allow outgoing, allow only the ports you actually serve.
**Why:** A firewall is the single most impactful hardening you'll apply: it blocks every service that ever ends up listening on `0.0.0.0` by mistake. 

Without it, the rest of this guide is bypassable by the first misconfigured daemon.

UFW is the simplest layer on Debian/Ubuntu: it generates nftables rules underneath. 

For complex topologies (NAT, multiple interfaces, custom chains) configure nftables directly (I definitely recommend learning IPTables and use that).

### 5.1 UFW: simple default-deny

> [!CAUTION]
> **Allow SSH before enabling UFW**, otherwise you'll lock yourself out of a remote session immediately.

```bash
# 1. Set the defaults
ufw default deny incoming
ufw default allow outgoing

# 2. Allow SSH (the *only* port reachable until you add more)
ufw allow OpenSSH       # = port 22/tcp; replace with the actual port if you moved it

# 3. (Optional) restrict SSH to the management subnet
# ufw allow from 10.0.0.0/24 to any port 22 proto tcp

# 4. Allow whatever else the server actually serves
# ufw allow 80/tcp
# ufw allow 443/tcp

# 5. Enable
ufw --force enable
```

**Verify:**

```bash
ufw status verbose
```

### 5.2 Rate-limit SSH

Mitigates a brute-force flood before fail2ban even sees it:

```bash
ufw limit OpenSSH
```

UFW's `limit` allows up to 6 connection attempts per 30s per source IP, then drops.

### 5.3 Persistence and logging

```bash
ufw logging on        # logs to /var/log/ufw.log
systemctl enable ufw  # survives reboot
```

---

## 6. Filesystem Mount Options

**What:** Apply `noexec`, `nodev`, `nosuid` to temporary and shared-memory filesystems; `nodev` on user partitions.
**Why:** Prevents executing binaries, creating device nodes, or honoring setuid bits in world-writable areas, a common foothold for attackers.

### 6.1 /dev/shm

`/etc/fstab`:

```fstab
tmpfs   /dev/shm   tmpfs   defaults,noexec,nodev,nosuid   0 0
```

```bash
mount -o remount /dev/shm
```

### 6.2 /tmp and /var/tmp (if separate partitions)

Add `nodev,nosuid` to the options field of the relevant `/etc/fstab` entries, then:

```bash
mount -o remount /tmp
mount -o remount /var/tmp
```

If `/tmp` is a systemd mount, edit `/etc/systemd/system/local-fs.target.wants/tmp.mount`:

```ini
[Mount]
Options=mode=1777,strictatime,nodev,nosuid
```

```bash
systemctl daemon-reload
systemctl restart tmp.mount
```

### 6.3 /home, /var/log, /var/log/audit, removable media

Add `nodev` to `/home`, and `noexec,nodev,nosuid` to any removable-media entries. 

If `/var/log` and `/var/log/audit` are separate partitions (recommended on auditable systems), they should also carry `nodev,nosuid`.

**Verify (nothing should be returned):**

```bash
for p in /tmp /var/tmp /dev/shm; do
  for o in noexec nodev nosuid; do
    mount | grep -E "\s$p\s" | grep -qv "$o" && echo "$p missing $o"
  done
done
```

---

## 7. SSH Server Hardening

**What:** Lock down `sshd` to strong crypto, no root login, sane session limits.
**Why:** SSH is the primary remote entry point: weak settings invite brute force, MITM, and session hijacking.

Apply to `/etc/ssh/sshd_config` (or a drop-in in `/etc/ssh/sshd_config.d/99-hardening.conf`):

```conf
# Logging
LogLevel VERBOSE

# Authentication
PermitRootLogin no
PermitUserEnvironment no
PermitEmptyPasswords no
HostbasedAuthentication no
IgnoreRhosts yes
MaxAuthTries 4
LoginGraceTime 60

# Prefer key-based auth; enable PAM for account/session processing
UsePAM yes
PubkeyAuthentication yes

# Set to "no" once every user has a working key:
PasswordAuthentication yes
KbdInteractiveAuthentication no

# Session controls
ClientAliveInterval 300
ClientAliveCountMax 3
MaxSessions 10
MaxStartups 10:30:60

# Banner (configured in §14)
Banner /etc/issue.net

# Strong algorithms only
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,ecdh-sha2-nistp521,ecdh-sha2-nistp384,ecdh-sha2-nistp256,diffie-hellman-group-exchange-sha256

# Optionally restrict who can log in
# AllowGroups ssh-users
```

Validate config before restarting (prevents lockout from a typo):

```bash
sshd -t && systemctl restart ssh
```

**Verify:**

```bash
sshd -T | grep -Ei 'permitrootlogin|loglevel|ciphers|macs|kexalgorithms|logingracetime|clientaliveinterval|maxstartups|usepam|banner|hostbasedauth|ignorerhosts'
```

> [!TIP]
> Once every user has a working public key, set `PasswordAuthentication no` and add `AuthenticationMethods publickey` to enforce key-only login. 
> 
> Both together eliminate the password-attack surface entirely.

For everything around keys (generation, distribution, agent forwarding, key rotation), see [[SSH-Linux|the SSH guide]].

---

## 8. PAM, Password, and Account Policy

> [!IMPORTANT]
> On Debian/Ubuntu, **do not hand-edit** `/etc/pam.d/common-auth`, `common-password`, `common-account`, `common-session`. They're regenerated by `pam-auth-update` on every `libpam-runtime` package upgrade, and your changes will silently disappear.
>
> The supported way is to deploy custom profiles in `/usr/share/pam-configs/` and enable them via `pam-auth-update --enable`. The examples below follow that pattern.

### 8.1 Password complexity (pam_pwquality)

**What:** Require strong passwords.
**Why:** Strong passwords resist brute force and dictionary attacks.

`/etc/security/pwquality.conf`:

```conf
minlen = 14
minclass = 4
dcredit = -1
ucredit = -1
ocredit = -1
lcredit = -1
retry = 3
enforce_for_root
```

The `libpam-pwquality` package ships its own pam-configs profile; enable it:

```bash
pam-auth-update --enable pwquality
```

### 8.2 Account lockout (pam_faillock)

**What:** Lock accounts after repeated failed logins.
**Why:** Mitigates brute-force attacks against local accounts (defense in depth on top of fail2ban which works at IP level).

`/etc/security/faillock.conf`:

```conf
deny = 5
unlock_time = 900
fail_interval = 900
```

Create a pam-configs profile `/usr/share/pam-configs/faillock`:

```conf
Name: Account lockout via pam_faillock
Default: yes
Priority: 0
Auth-Type: Primary
Auth:
    [default=die]   pam_faillock.so authfail
Auth-Initial:
    required        pam_faillock.so preauth
Account-Type: Primary
Account:
    required        pam_faillock.so
```

Enable and apply:

```bash
pam-auth-update --enable faillock
```

To unlock a user manually:

```bash
faillock --user <username> --reset
```

### 8.3 Password hashing

**What:** Force SHA-512 (or yescrypt, the modern default on recent Debian).
**Why:** Raises the cost of offline cracking after a `/etc/shadow` leak.

`/etc/login.defs`:

```conf
ENCRYPT_METHOD       SHA512
SHA_CRYPT_MIN_ROUNDS 65536
SHA_CRYPT_MAX_ROUNDS 65536
```

(`yescrypt` is the new default on Debian 12+ and is even stronger: if your distro uses it, leave it alone)

### 8.4 Password history

**What:** Forbid reuse of recent passwords.
**Why:** Prevents users cycling back to a known-compromised password.

Create `/usr/share/pam-configs/pwhistory`:

```conf
Name: Password history (pam_pwhistory)
Default: yes
Priority: 1024
Password-Type: Primary
Password:
    required        pam_pwhistory.so remember=5 enforce_for_root use_authtok
```

```bash
pam-auth-update --enable pwhistory
```

### 8.5 Password aging

**What:** Enforce expiration, minimum age, and advance warning.
**Why:** Limits the window of usefulness of compromised credentials.

`/etc/login.defs`:

```conf
PASS_MAX_DAYS   365
PASS_MIN_DAYS   1
PASS_WARN_AGE   7
```

Apply to existing users as needed:

```bash
chage --maxdays 365 --mindays 1 --warndays 7 <user>
```

### 8.6 Restrict su to a wheel group

**What:** Limit `su` to members of `wheel`, kept intentionally empty.
**Why:** Pushes everyone toward `sudo` for granular control and per-command audit logging.

```bash
groupadd -f wheel
```

Add to `/etc/pam.d/su` (this file is not regenerated by `pam-auth-update`, safe to hand-edit):

```conf
auth required pam_wheel.so use_uid group=wheel
```

Keep `wheel` empty so nobody can `su` directly.

Add a user only when you have a documented, time-bounded reason.

### 8.7 Restrict root console login

**What:** Limit (or forbid) where root may log in directly.
**Why:** Ensures the console is physically secured and no unexpected terminals are allowed.

```bash
# Forbid root login from every tty (recommended on remote servers)
: > /etc/securetty
chmod 600 /etc/securetty

# Alternative: allow only the physical console + tty1
# printf "console\ntty1\n" > /etc/securetty
```

### 8.8 System-wide umask

**What:** Set a restrictive default file-creation mask for all users *and* services.
**Why:** A `umask` in `/etc/profile.d/` only affects interactive login shells: services, cron jobs, sudo, and systemd units ignore it. 

The right place is `login.defs` + `pam_umask`.

`/etc/login.defs`:

```conf
UMASK 027
```

Ensure `pam_umask.so` is in the session stack, it usually is by default on Debian/Ubuntu, verify with:

```bash
grep -r pam_umask /etc/pam.d/ /usr/share/pam-configs/
```

For interactive bash shells (belt-and-braces) also drop in `/etc/profile.d/set_umask.sh`:

```sh
umask 027
```

---

## 9. Sudo Hardening

**What:** Make sudo run in a PTY, log to a dedicated file, shorten credential caching, disable insecure features.
**Why:** Mitigates background-process attacks, simplifies auditing, and reduces the window where cached sudo credentials can be abused.

Add via `visudo -f /etc/sudoers.d/00-hardening`:

```conf
Defaults use_pty
Defaults logfile="/var/log/sudo.log"
Defaults timestamp_timeout=5
Defaults !visiblepw
Defaults env_reset
Defaults requiretty
```

> [!INFO]
> `timestamp_timeout=5` is a compromise. CIS recommends `0` (always re-prompt) but it's measurably annoying on heavy-administration boxes. Lower it on bastion hosts where the trade-off is worth it.

**Verify:**

```bash
sudo -V | grep -i 'pty\|env_reset'
grep -Ei 'use_pty|logfile|timestamp_timeout|visiblepw|env_reset' /etc/sudoers /etc/sudoers.d/*
```

---

## 10. Auditing (auditd)

**What:** Record security-relevant events and protect the audit trail.
**Why:** Without auditd you cannot reliably detect or investigate privilege escalation, file tampering, and policy violations.

`/etc/audit/rules.d/hardening.rules`:

```conf
# ─── Authentication & account changes ───────────────────
-w /etc/passwd       -p wa -k identity
-w /etc/group        -p wa -k identity
-w /etc/shadow       -p wa -k identity
-w /etc/gshadow      -p wa -k identity
-w /etc/sudoers      -p wa -k scope
-w /etc/sudoers.d/   -p wa -k scope

# ─── Login records ──────────────────────────────────────
-w /var/log/lastlog  -p wa -k logins
-w /var/log/faillog  -p wa -k logins
-w /var/run/utmp     -p wa -k session
-w /var/log/wtmp     -p wa -k session
-w /var/log/btmp     -p wa -k session

# ─── Privilege escalation ───────────────────────────────
-w /usr/bin/sudo     -p x  -k privileged
-w /bin/su           -p x  -k privileged

# ─── Kernel module loading ──────────────────────────────
-w /sbin/insmod      -p x  -k modules
-w /sbin/rmmod       -p x  -k modules
-w /sbin/modprobe    -p x  -k modules
-a always,exit -F arch=b64 -S init_module,delete_module -k modules

# ─── Time changes ───────────────────────────────────────
-a always,exit -F arch=b64 -S adjtimex,settimeofday    -k time-change
-a always,exit -F arch=b64 -S clock_settime            -k time-change
-w /etc/localtime    -p wa -k time-change

# ─── DAC permission changes (chmod/chown family) ────────
-a always,exit -F arch=b64 -S chmod,fchmod,fchmodat                   -F auid>=1000 -F auid!=4294967295 -k perm_mod
-a always,exit -F arch=b64 -S chown,fchown,fchownat,lchown            -F auid>=1000 -F auid!=4294967295 -k perm_mod
-a always,exit -F arch=b64 -S setxattr,lsetxattr,fsetxattr,removexattr -F auid>=1000 -F auid!=4294967295 -k perm_mod

# ─── Unauthorized access attempts (EACCES / EPERM) ──────
-a always,exit -F arch=b64 -S open,openat,creat,truncate,ftruncate -F exit=-EACCES -F auid>=1000 -F auid!=4294967295 -k access
-a always,exit -F arch=b64 -S open,openat,creat,truncate,ftruncate -F exit=-EPERM  -F auid>=1000 -F auid!=4294967295 -k access

# ─── Mount events ───────────────────────────────────────
-a always,exit -F arch=b64 -S mount -F auid>=1000 -F auid!=4294967295 -k mounts

# ─── Network environment ────────────────────────────────
-w /etc/hosts           -p wa -k system-locale
-w /etc/network/        -p wa -k system-locale
-w /etc/netplan/        -p wa -k system-locale

# ─── Make the config immutable until reboot (PLACE LAST) ─
-e 2
```

Enable and load:

```bash
systemctl enable --now auditd
augenrules --load
auditctl -l        # list active rules
```

> [!important]
> auditd generates **tens of thousands of events per day** even on a quiet server. Without a consumer that collects, parses and alerts on them, they stay forensic-only: useful *after* an incident, not for real-time detection.
>
> Some useful open-source consumers are **Wazuh** or **Elastic SIEM** if you're already in the ELK stack, or even **Splunk** in enterprise environments.

---

## 11. Logging

### 11.1 rsyslog with restrictive permissions

**What:** Ensure rsyslog is installed, running, and creates log files with restrictive permissions.
**Why:** Logs contain sensitive data (failed auth attempts, IP addresses, file paths) and must not be world-readable.

```bash
systemctl enable --now rsyslog
```

In `/etc/rsyslog.conf`:

```conf
$FileCreateMode 0640
$DirCreateMode  0750
```

### 11.2 Permissions on existing logs

```bash
find /var/log -type f -exec chmod g-wx,o-rwx "{}" + \
  -o -type d -exec chmod g-wx,o-rwx "{}" +
```

### 11.3 Remote log forwarding

**What:** Forward logs to a central host.
**Why:** If a host is compromised, remote copies preserve the evidence and centralized log aggregation makes correlation across hosts possible.

`/etc/rsyslog.d/90-remote.conf`:

```conf
# Plain TCP — fine on a private management LAN
*.* @@loghost.example.com:514

# Better: TLS-encrypted forwarding (requires rsyslog-gnutls and a CA-signed cert)
# *.* @@(o)loghost.example.com:6514
```

```bash
systemctl restart rsyslog
```

> [!INFO]
> For anything traversing untrusted networks, use **rsyslog over TLS** (`omfwd` with `StreamDriverMode=1`). See [[tls-certificates|the TLS certificates reference]] for cert generation and inspection.

### 11.4 Log rotation

Ensure `/etc/logrotate.conf` and `/etc/logrotate.d/*` rotate logs per policy. 

Example custom rule `/etc/logrotate.d/iptables`:

```conf
/var/log/iptables.log {
    rotate 4
    weekly
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        invoke-rc.d rsyslog rotate >/dev/null 2>&1 || true
    endscript
}
```

### 11.5 Cron permissions

**What:** Lock down cron config files and directories so only root can read or modify them.

```bash
systemctl enable --now cron

# Spool and config dirs
chown root:root /etc/cron.{hourly,daily,weekly,monthly,d}/
chmod 0700      /etc/cron.{hourly,daily,weekly,monthly,d}/

# Main config files
chown root:root /etc/crontab
chmod 0600      /etc/crontab

# allow/deny lists: prefer cron.allow over cron.deny
touch /etc/cron.allow
chown root:root /etc/cron.allow
chmod 0600      /etc/cron.allow
rm -f /etc/cron.deny

# Same treatment for at(1)
touch /etc/at.allow
chown root:root /etc/at.allow
chmod 0600      /etc/at.allow
rm -f /etc/at.deny
```

---

## 12. Brute-Force Protection (fail2ban)

**What:** Automatically ban IPs that repeatedly fail authentication.
**Why:** Defense in depth on top of SSH and PAM lockout: banning at the network layer reduces log noise and slows attackers across multiple services.

`/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
# Whitelist your management LAN — never ban yourself
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/24

[sshd]
enabled = true
```

```bash
systemctl enable --now fail2ban
fail2ban-client status sshd
```

---

## 13. Automatic Security Updates

**What:** Apply security patches automatically.
**Why:** Most compromises exploit known, already-patched vulnerabilities, so automated patching closes that window without operator intervention.

> [!DANGER]
> In critical production servers you may want to do the opposite: disable unattended upgrades, so that anything important that you have running on them doesn't randomly break all of a sudden.
> 

```bash
apt-get install -y unattended-upgrades apt-listchanges
dpkg-reconfigure -plow unattended-upgrades
```

`/etc/apt/apt.conf.d/50unattended-upgrades` - restrict to security, mail on failure, avoid surprise reboots in production:

```conf
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::MinimalSteps "true";

// Mail address for upgrade reports (errors and important events)
Unattended-Upgrade::Mail "root";
Unattended-Upgrade::MailReport "on-change";
```

Verify the timer is active:

```bash
systemctl status unattended-upgrades.timer
systemctl status unattended-upgrades.service
```

---

## 14. Banners, MOTD, and Shell Environment

### 14.1 Login banners

**What:** Display a legal warning before/at login and remove OS version details.
**Why:** Supports prosecution of unauthorized access (in many jurisdictions it's a prerequisite) and hides version info useful to attackers.

```bash
cat > /etc/issue <<'EOF'
WARNING: Authorized uses only. All activity may be monitored and reported.
Unauthorized access is prohibited and will be prosecuted to the full extent of the law.
EOF

cp /etc/issue /etc/issue.net
```

Remove any `\m \r \s \v` escape sequences or OS references from `/etc/motd`, `/etc/issue`, and `/etc/issue.net`.

### 14.2 Disable Ubuntu MOTD news

```bash
rm -f /etc/default/motd-news
chmod -x /etc/update-motd.d/50-motd-news 2>/dev/null || true
```

### 14.3 Shell environment defaults

Deploy drop-ins under `/etc/profile.d/`.

Automatic idle logout - `/etc/profile.d/tmout.sh`:

```sh
# Auto-logout after 15 min of inactivity (CIS L1 default; raise to 3600 if 1h is preferred)
declare -xr TMOUT=900
```

The `declare -xr` makes `TMOUT` **exported** (so child shells inherit it) and **readonly** (so users can't `unset` it).

---

## 15. Mandatory Access Control (AppArmor)

**What:** Ensure AppArmor is installed, enabled, and profiles are enforced rather than left in complain mode.
**Why:** Confines services to the files, capabilities, and network access they need, containing the blast radius of a compromise.

```bash
apt-get install -y apparmor apparmor-utils apparmor-profiles apparmor-profiles-extra
systemctl enable --now apparmor
aa-status
```

To put a profile in enforce mode:

```bash
aa-enforce /etc/apparmor.d/usr.sbin.sshd
aa-enforce /etc/apparmor.d/usr.sbin.rsyslogd
```

> [!TIP]
> Review `aa-status` for profiles in **complain mode** and promote them to **enforce** after validating they don't break functionality. To craft a profile for a new service, use `aa-genprof` (interactive) or `aa-logprof` (replay-based).

---

## 16. Final Verification and Compliance Scan

### 16.1 root PATH integrity

**What:** Ensure root's PATH has no empty, trailing, or world-writable entries and no current directory.
**Why:** A poisoned PATH can trick root into running a malicious binary placed in a writable directory.

```bash
#!/bin/bash
echo "$PATH" | grep -q "::" && echo "Empty directory in PATH (::)"
echo "$PATH" | grep -q ":$" && echo "Trailing : in PATH"
for x in $(echo "$PATH" | tr ":" " "); do
  if [ -d "$x" ]; then
    ls -ldH "$x" | awk '
      $9 == "." {print "PATH contains current working directory (.)"}
      $3 != "root" {print $9, "is not owned by root"}
      substr($1,6,1) != "-" {print $9, "is group writable"}
      substr($1,9,1) != "-" {print $9, "is world writable"}'
  else
    echo "$x is not a directory"
  fi
done
```

### 16.2 shadow group is empty

```bash
grep ^shadow:[^:]*:[^:]*:[^:]+ /etc/group   # should return nothing
```

### 16.3 World-writable and unexpected SUID/SGID files

```bash
# World-writable files on local filesystems (should be empty or justified)
df --local -P | awk 'NR!=1 {print $6}' | \
  xargs -I '{}' find '{}' -xdev -type f -perm -0002

# SUID / SGID inventory (review against a known-good baseline)
find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -exec ls -l {} \;

# Unowned files (orphaned UIDs/GIDs after package removal)
find / -xdev \( -nouser -o -nogroup \) -ls
```

### 16.4 Automated compliance scan

Run a standardized audit to catch what manual checks miss and to track drift over time:

```bash
# Lynis — quick security audit
apt-get install -y lynis
lynis audit system

# OpenSCAP against a CIS/SSG profile (more formal, slower)
apt-get install -y openscap-scanner ssg-debian   # package names vary by release
oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  /usr/share/xml/scap/ssg/content/ssg-debian12-ds.xml
```

Re-run a compliance scan **periodically** (monthly) and **after major changes** to detect configuration drift.

---

## Quick Checklist

- [ ] Unnecessary packages purged; required tooling installed (rsyslog, chrony, auditd, ufw, fail2ban, unattended-upgrades)
- [ ] Unused services disabled; time sync working
- [ ] Unused kernel modules blocked (`cramfs`, `udf`, `hfs`, ...); USB storage disabled where applicable
- [ ] sysctl hardening applied (routing, IPv6 hardening, info-leak protections)
- [ ] **Firewall**: default-deny incoming, SSH allowed, UFW enabled and persistent
- [ ] `/dev/shm`, `/tmp`, `/var/tmp` mounted `nodev,nosuid`. `/home` `nodev`
- [ ] SSH: no root login, no host-based auth, strong ciphers/MACs/KEX, session limits, banner, validated config
- [ ] PAM hardening applied via `pam-auth-update` profiles (not by hand-editing common-*)
- [ ] Password complexity, lockout (faillock), SHA-512, history (pwhistory), and aging configured
- [ ] `su` restricted to empty `wheel` group. root tty login forbidden by **empty** `/etc/securetty`
- [ ] System-wide `umask 027` set in `login.defs` (not just `/etc/profile.d/`)
- [ ] Sudo: `use_pty`, dedicated log file, short timestamp timeout, `!visiblepw`, `env_reset`
- [ ] auditd installed with rules (identity, scope, privileged, DAC, mount, access, time)
- [ ] rsyslog running, `0640` file mode, logs forwarded (TLS if over WAN), rotation configured
- [ ] Cron directories `0700 root:root`. `cron.allow`/`at.allow` configured, `*.deny` removed
- [ ] fail2ban active for sshd. Management LAN whitelisted
- [ ] Unattended security upgrades enabled (no auto-reboot in prod, mail on errors, minimal steps)
- [ ] Banners set. MOTD news disabled. `TMOUT` and `umask 027` deployed
- [ ] AppArmor enabled. Critical profiles (sshd, rsyslogd) in enforce mode