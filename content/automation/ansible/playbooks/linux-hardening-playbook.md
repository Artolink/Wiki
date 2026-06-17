---
title: "Linux server hardening with Ansible: complete playbook"
tags:
---

This is the Ansible implementation of [[linux-server-hardening|the Linux server hardening guide]]: same sections, same controls, but automated.

It targets **Debian 11/12 and Ubuntu 22.04/24.04**. 

You can run the whole playbook or any subset with `--tags`.

***

## Project layout

The one that I write here is a all-in-one layout: it includes the inventory, group_vars and everything the playbook needs under the same "linux-hardening" directory.

```
linux-hardening/
├── ansible.cfg
├── inventory.yml
├── group_vars/
│   └── hardened_servers.yml
├── linux-hardening.yml
└── templates/
    ├── sshd-hardening.conf.j2
    ├── sysctl-hardening.conf.j2
    ├── audit-hardening.rules.j2
    ├── fail2ban-jail.local.j2
    ├── unattended-upgrades.conf.j2
    └── pam-faillock.j2
```

This of course is not the only way to do it: for example, if you followed my [[my-awx-stack|Ansible AWX]] and [[gitlab-setup|Gitlab]] guides, you will have your inventory and your playbooks divided in different GitLab groups, and this is a way better scalable separation for a real production environment.

***

## ansible.cfg

```ini
[defaults]
inventory = inventory.yml
host_key_checking = False
retry_files_enabled = False
stdout_callback = yaml
deprecation_warnings = False
forks = 10

[privilege_escalation]
become = True
become_method = sudo
become_user = root
become_ask_pass = False

[ssh_connection]
pipelining = True
control_path = /tmp/ansible-ssh-%%h-%%p-%%r
```

***

## inventory.yml

```yaml
---
all:
  children:
    hardened_servers:
      hosts:
        vps-01:
          ansible_host: 10.0.0.10
          ansible_user: admin
        vps-02:
          ansible_host: 10.0.0.11
          ansible_user: admin
```

***

## group_vars/hardened_servers.yml

All the policy values centralised here. 

Adapt to your site policy before running.

```yaml
---
# ── SSH ────────────────────────────────────────────────────────────────────
ssh_port: 22
# IMPORTANT: leave true until every user has a working public key.
# Switch to false once you've verified key-based login works for everyone.
ssh_password_auth: true

# ── Firewall (UFW) ─────────────────────────────────────────────────────────
# SSH is added automatically (rate-limited) — add other ports your server serves.
ufw_extra_allow:
  # - { port: 80,   proto: tcp, rule: allow }
  # - { port: 443,  proto: tcp, rule: allow }

# Optional: restrict SSH to a management subnet (defense in depth on top of fail2ban).
# Leave empty to allow SSH from anywhere.
ssh_management_cidrs: []
  # - 10.0.0.0/24

# ── Password policy (pam_pwquality) ────────────────────────────────────────
password_min_length: 14
password_max_days: 365
password_min_days: 1
password_warn_age: 7
password_history: 5
password_enforce_for_root: true

# ── Account lockout (pam_faillock) ─────────────────────────────────────────
faillock_deny: 5
faillock_unlock_time: 900       # 15 min
faillock_fail_interval: 900

# ── Shell environment ──────────────────────────────────────────────────────
shell_tmout_seconds: 900        # 15 min; raise to 3600 if too aggressive
system_umask: "027"

# ── Sudo ───────────────────────────────────────────────────────────────────
sudo_timestamp_timeout: 5       # 0 = always prompt; CIS L1 strict

# ── Auditd ─────────────────────────────────────────────────────────────────
# Set true ONLY after the ruleset is stable. Once true, the rules become
# immutable until reboot — you cannot change them without a reboot.
auditd_immutable: false

# ── Fail2ban ───────────────────────────────────────────────────────────────
fail2ban_bantime: 1h
fail2ban_findtime: 10m
fail2ban_maxretry: 5
fail2ban_ignoreip:
  - 127.0.0.1/8
  - ::1
  # - 10.0.0.0/24

# ── Unattended-upgrades ────────────────────────────────────────────────────
# Master switch: set to false to skip auto-updates entirely (e.g. on hosts
# managed by a separate patching pipeline). When false, the playbook also
# disables the existing timer if it was previously enabled.
unattended_upgrades_enabled: true
unattended_auto_reboot: false   # NEVER true in production
unattended_mail: "root"

# ── Time sync ──────────────────────────────────────────────────────────────
ntp_pool: 2.debian.pool.ntp.org

# ── Banner ─────────────────────────────────────────────────────────────────
login_banner: |
  WARNING: Authorized uses only. All activity may be monitored and reported.
  Unauthorized access is prohibited and will be prosecuted to the full extent of the law.
```

***

## linux-hardening.yml

The main playbook. 

Organised section by section, mirroring the hardening guide.

```yaml
---
- name: Linux server hardening (Debian/Ubuntu) — based on CIS L1 + extras
  hosts: hardened_servers
  become: true
  gather_facts: true

  pre_tasks:
    - name: Sanity check — only Debian/Ubuntu supported
      ansible.builtin.assert:
        that:
          - ansible_facts.os_family == "Debian"
        fail_msg: "This playbook only supports Debian/Ubuntu."
      tags: always

    - name: Update apt cache
      ansible.builtin.apt:
        update_cache: true
        cache_valid_time: 3600
      tags: always

  tasks:

    # ──────────────────────────────────────────────────────────────────────
    # §2 — Packages and services
    # ──────────────────────────────────────────────────────────────────────
    - name: §2.1 — Purge unnecessary packages
      ansible.builtin.apt:
        name:
          - telnet
          - telnetd
          - rsh-client
          - rsh-redone-client
          - talk
          - nis
          - ldap-utils
          - xinetd
        state: absent
        purge: true
        autoremove: true
      tags: [packages]

    - name: §2.2 — Install hardening tooling
      ansible.builtin.apt:
        name:
          - rsyslog
          - chrony
          - auditd
          - audispd-plugins
          - unattended-upgrades
          - apt-listchanges
          - fail2ban
          - libpam-pwquality
          - libpam-modules
          - ufw
          - apparmor
          - apparmor-utils
          - apparmor-profiles
          - apparmor-profiles-extra
        state: present
      tags: [packages]

    - name: §2.3 — Disable services not needed on a server
      ansible.builtin.systemd:
        name: "{{ item }}"
        enabled: false
        state: stopped
      loop:
        - postfix
        - bluetooth
      failed_when: false   # Skip cleanly if not installed
      tags: [packages]

    - name: §2.4 — Time sync via chrony
      ansible.builtin.copy:
        dest: /etc/chrony/chrony.conf
        owner: root
        group: root
        mode: "0644"
        content: |
          pool {{ ntp_pool }} iburst
          driftfile /var/lib/chrony/chrony.drift
          makestep 1.0 3
          rtcsync
      notify: restart chrony
      tags: [packages]

    # ──────────────────────────────────────────────────────────────────────
    # §3 — Kernel modules and filesystem types
    # ──────────────────────────────────────────────────────────────────────
    - name: §3.1 — Disable unused filesystem modules
      ansible.builtin.copy:
        dest: /etc/modprobe.d/cis-filesystem.conf
        owner: root
        group: root
        mode: "0644"
        content: |
          install cramfs    /bin/true
          install freevxfs  /bin/true
          install jffs2     /bin/true
          install hfs       /bin/true
          install hfsplus   /bin/true
          install udf       /bin/true
      tags: [kernel-modules]

    - name: §3.1 — Unload modules already in memory
      community.general.modprobe:
        name: "{{ item }}"
        state: absent
      loop:
        - cramfs
        - freevxfs
        - jffs2
        - hfs
        - hfsplus
        - udf
      failed_when: false
      tags: [kernel-modules]

    # ──────────────────────────────────────────────────────────────────────
    # §4 — Kernel and network parameters (sysctl)
    # ──────────────────────────────────────────────────────────────────────
    - name: §4 — Deploy sysctl hardening
      ansible.builtin.template:
        src: sysctl-hardening.conf.j2
        dest: /etc/sysctl.d/20-hardening.conf
        owner: root
        group: root
        mode: "0644"
      notify: reload sysctl
      tags: [sysctl]

    # ──────────────────────────────────────────────────────────────────────
    # §5 — Firewall (UFW)
    # ──────────────────────────────────────────────────────────────────────
    # CRITICAL ORDER: allow SSH BEFORE switching to default deny, or you
    # will lock yourself out. Ansible handles this in a single play but
    # the task order below still matters.
    - name: §5 — UFW default policies
      community.general.ufw:
        direction: "{{ item.direction }}"
        policy: "{{ item.policy }}"
      loop:
        - { direction: incoming, policy: deny }
        - { direction: outgoing, policy: allow }
      tags: [firewall]

    - name: §5 — UFW allow SSH (rate-limited)
      community.general.ufw:
        rule: limit
        port: "{{ ssh_port }}"
        proto: tcp
      tags: [firewall]

    - name: §5 — UFW restrict SSH to management CIDRs (if any)
      community.general.ufw:
        rule: allow
        from_ip: "{{ item }}"
        to_port: "{{ ssh_port }}"
        proto: tcp
      loop: "{{ ssh_management_cidrs }}"
      when: ssh_management_cidrs | length > 0
      tags: [firewall]

    - name: §5 — UFW extra application ports
      community.general.ufw:
        rule: "{{ item.rule }}"
        port: "{{ item.port }}"
        proto: "{{ item.proto }}"
      loop: "{{ ufw_extra_allow }}"
      tags: [firewall]

    - name: §5 — Enable UFW + logging
      community.general.ufw:
        state: enabled
        logging: "on"
      tags: [firewall]

    # ──────────────────────────────────────────────────────────────────────
    # §6 — Filesystem mount options
    # ──────────────────────────────────────────────────────────────────────
    - name: §6.1 — /dev/shm with noexec,nodev,nosuid
      ansible.posix.mount:
        path: /dev/shm
        src: tmpfs
        fstype: tmpfs
        opts: defaults,noexec,nodev,nosuid
        state: mounted
      tags: [mount]

    # NOTE: /tmp and /var/tmp mount options are intentionally NOT applied
    # automatically — `noexec /tmp` breaks too many edge cases (snap, some
    # apt postinst scripts, Java tmpdirs). Apply manually after testing.

    # ──────────────────────────────────────────────────────────────────────
    # §7 — SSH server hardening
    # ──────────────────────────────────────────────────────────────────────
    - name: §7 — Deploy sshd hardening drop-in
      ansible.builtin.template:
        src: sshd-hardening.conf.j2
        dest: /etc/ssh/sshd_config.d/99-hardening.conf
        owner: root
        group: root
        mode: "0600"
        validate: "/usr/sbin/sshd -t -f %s"   # blocks lockout from typos
      notify: restart ssh
      tags: [ssh]

    # ──────────────────────────────────────────────────────────────────────
    # §8 — PAM, password, and account policy
    # ──────────────────────────────────────────────────────────────────────
    - name: §8.1 — pam_pwquality config
      ansible.builtin.copy:
        dest: /etc/security/pwquality.conf
        owner: root
        group: root
        mode: "0644"
        content: |
          minlen   = {{ password_min_length }}
          minclass = 4
          dcredit  = -1
          ucredit  = -1
          ocredit  = -1
          lcredit  = -1
          retry    = 3
          {% if password_enforce_for_root %}
          enforce_for_root
          {% endif %}
      tags: [pam]

    - name: §8.1 — Enable pwquality via pam-auth-update
      ansible.builtin.command: pam-auth-update --enable pwquality --force
      changed_when: false
      tags: [pam]

    - name: §8.2 — pam_faillock config
      ansible.builtin.copy:
        dest: /etc/security/faillock.conf
        owner: root
        group: root
        mode: "0644"
        content: |
          deny         = {{ faillock_deny }}
          unlock_time  = {{ faillock_unlock_time }}
          fail_interval = {{ faillock_fail_interval }}
      tags: [pam]

    - name: §8.2 — Deploy faillock pam-configs profile
      ansible.builtin.template:
        src: pam-faillock.j2
        dest: /usr/share/pam-configs/faillock
        owner: root
        group: root
        mode: "0644"
      tags: [pam]

    - name: §8.2 — Enable faillock via pam-auth-update
      ansible.builtin.command: pam-auth-update --enable faillock --force
      changed_when: false
      tags: [pam]

    - name: §8.3 / §8.5 — Password hashing + aging in login.defs
      ansible.builtin.lineinfile:
        path: /etc/login.defs
        regexp: "^#?\\s*{{ item.key }}\\b"
        line: "{{ item.key }}    {{ item.value }}"
        state: present
      loop:
        - { key: ENCRYPT_METHOD,       value: SHA512 }
        - { key: SHA_CRYPT_MIN_ROUNDS, value: "65536" }
        - { key: SHA_CRYPT_MAX_ROUNDS, value: "65536" }
        - { key: PASS_MAX_DAYS,        value: "{{ password_max_days }}" }
        - { key: PASS_MIN_DAYS,        value: "{{ password_min_days }}" }
        - { key: PASS_WARN_AGE,        value: "{{ password_warn_age }}" }
        - { key: UMASK,                value: "{{ system_umask }}" }
      tags: [pam]

    - name: §8.6 — Create empty wheel group for su restriction
      ansible.builtin.group:
        name: wheel
        state: present
      tags: [pam]

    - name: §8.6 — Restrict su to wheel via pam_wheel
      ansible.builtin.lineinfile:
        path: /etc/pam.d/su
        regexp: "^#?\\s*auth\\s+required\\s+pam_wheel\\.so"
        line: "auth required pam_wheel.so use_uid group=wheel"
        state: present
      tags: [pam]

    - name: §8.7 — Empty /etc/securetty (forbid root tty login)
      ansible.builtin.copy:
        dest: /etc/securetty
        owner: root
        group: root
        mode: "0600"
        content: ""
      tags: [pam]

    - name: §8.8 — Belt-and-braces interactive umask
      ansible.builtin.copy:
        dest: /etc/profile.d/set_umask.sh
        owner: root
        group: root
        mode: "0644"
        content: |
          umask {{ system_umask }}
      tags: [pam, banners]

    # ──────────────────────────────────────────────────────────────────────
    # §9 — Sudo hardening
    # ──────────────────────────────────────────────────────────────────────
    - name: §9 — Deploy sudo hardening (validated with visudo)
      ansible.builtin.copy:
        dest: /etc/sudoers.d/00-hardening
        owner: root
        group: root
        mode: "0440"
        validate: "visudo -cf %s"
        content: |
          Defaults use_pty
          Defaults logfile="/var/log/sudo.log"
          Defaults timestamp_timeout={{ sudo_timestamp_timeout }}
          Defaults !visiblepw
          Defaults env_reset
          Defaults requiretty
      tags: [sudo]

    # ──────────────────────────────────────────────────────────────────────
    # §10 — Auditing (auditd)
    # ──────────────────────────────────────────────────────────────────────
    - name: §10 — Deploy audit rules
      ansible.builtin.template:
        src: audit-hardening.rules.j2
        dest: /etc/audit/rules.d/hardening.rules
        owner: root
        group: root
        mode: "0640"
      notify: reload audit rules
      tags: [auditd]

    - name: §10 — Enable + start auditd
      ansible.builtin.systemd:
        name: auditd
        enabled: true
        state: started
      tags: [auditd]

    # ──────────────────────────────────────────────────────────────────────
    # §11 — Logging
    # ──────────────────────────────────────────────────────────────────────
    - name: §11.1 — rsyslog file mode
      ansible.builtin.lineinfile:
        path: /etc/rsyslog.conf
        regexp: "^\\$FileCreateMode"
        line: "$FileCreateMode 0640"
        state: present
      notify: restart rsyslog
      tags: [logging]

    - name: §11.2 — Tighten permissions on existing logs
      ansible.builtin.shell: |
        find /var/log -type f -exec chmod g-wx,o-rwx {} +
        find /var/log -type d -exec chmod g-wx,o-rwx {} +
      changed_when: false
      tags: [logging]

    - name: §11.5 — Cron config files mode
      ansible.builtin.file:
        path: "{{ item }}"
        owner: root
        group: root
        mode: "0700"
      loop:
        - /etc/cron.hourly
        - /etc/cron.daily
        - /etc/cron.weekly
        - /etc/cron.monthly
        - /etc/cron.d
      tags: [logging]

    - name: §11.5 — /etc/crontab mode
      ansible.builtin.file:
        path: /etc/crontab
        owner: root
        group: root
        mode: "0600"
      tags: [logging]

    - name: §11.5 — Create cron.allow / at.allow, remove cron.deny / at.deny
      block:
        - ansible.builtin.file:
            path: "{{ item }}"
            owner: root
            group: root
            mode: "0600"
            state: touch
          loop:
            - /etc/cron.allow
            - /etc/at.allow
          changed_when: false

        - ansible.builtin.file:
            path: "{{ item }}"
            state: absent
          loop:
            - /etc/cron.deny
            - /etc/at.deny
      tags: [logging]

    # ──────────────────────────────────────────────────────────────────────
    # §12 — Fail2ban
    # ──────────────────────────────────────────────────────────────────────
    - name: §12 — Deploy fail2ban jail.local
      ansible.builtin.template:
        src: fail2ban-jail.local.j2
        dest: /etc/fail2ban/jail.local
        owner: root
        group: root
        mode: "0644"
      notify: restart fail2ban
      tags: [fail2ban]

    - name: §12 — Enable + start fail2ban
      ansible.builtin.systemd:
        name: fail2ban
        enabled: true
        state: started
      tags: [fail2ban]

    # ──────────────────────────────────────────────────────────────────────
    # §13 — Automatic security updates  (master switch: unattended_upgrades_enabled)
    # ──────────────────────────────────────────────────────────────────────
    - name: §13 — Configure and enable unattended-upgrades
      when: unattended_upgrades_enabled | bool
      tags: [updates]
      block:
        - name: §13 — Deploy unattended-upgrades config
          ansible.builtin.template:
            src: unattended-upgrades.conf.j2
            dest: /etc/apt/apt.conf.d/50unattended-upgrades
            owner: root
            group: root
            mode: "0644"

        - name: §13 — Enable apt periodic config
          ansible.builtin.copy:
            dest: /etc/apt/apt.conf.d/20auto-upgrades
            owner: root
            group: root
            mode: "0644"
            content: |
              APT::Periodic::Update-Package-Lists "1";
              APT::Periodic::Unattended-Upgrade "1";
              APT::Periodic::AutocleanInterval "7";

        - name: §13 — Ensure unattended-upgrades timer is active
          ansible.builtin.systemd:
            name: unattended-upgrades
            enabled: true
            state: started

    - name: §13 — Disable unattended-upgrades if explicitly opted out
      when: not (unattended_upgrades_enabled | bool)
      tags: [updates]
      ansible.builtin.systemd:
        name: unattended-upgrades
        enabled: false
        state: stopped

    # ──────────────────────────────────────────────────────────────────────
    # §14 — Banners, MOTD, shell environment
    # ──────────────────────────────────────────────────────────────────────
    - name: §14.1 — Login banner /etc/issue + /etc/issue.net
      ansible.builtin.copy:
        dest: "{{ item }}"
        owner: root
        group: root
        mode: "0644"
        content: "{{ login_banner }}"
      loop:
        - /etc/issue
        - /etc/issue.net
      tags: [banners]

    - name: §14.2 — Disable Ubuntu MOTD news
      ansible.builtin.file:
        path: "{{ item }}"
        state: absent
      loop:
        - /etc/default/motd-news
      tags: [banners]

    - name: §14.2 — Strip exec bit from motd-news fetcher
      ansible.builtin.file:
        path: /etc/update-motd.d/50-motd-news
        mode: "0644"
      failed_when: false
      tags: [banners]

    - name: §14.3 — Deploy TMOUT (auto-logout, readonly)
      ansible.builtin.copy:
        dest: /etc/profile.d/tmout.sh
        owner: root
        group: root
        mode: "0644"
        content: |
          # Auto-logout after {{ shell_tmout_seconds }} seconds of inactivity
          declare -xr TMOUT={{ shell_tmout_seconds }}
      tags: [banners]

    # ──────────────────────────────────────────────────────────────────────
    # §15 — AppArmor
    # ──────────────────────────────────────────────────────────────────────
    - name: §15 — Ensure AppArmor is enabled + started
      ansible.builtin.systemd:
        name: apparmor
        enabled: true
        state: started
      tags: [apparmor]

    - name: §15 — Enforce critical profiles
      ansible.builtin.command: aa-enforce {{ item }}
      loop:
        - /etc/apparmor.d/usr.sbin.sshd
        - /etc/apparmor.d/usr.sbin.rsyslogd
      changed_when: false
      failed_when: false
      tags: [apparmor]

    # ──────────────────────────────────────────────────────────────────────
    # §10 — Make auditd ruleset immutable (ONLY if explicitly requested)
    # ──────────────────────────────────────────────────────────────────────
    - name: §10 — Append -e 2 to make audit rules immutable (LAST!)
      ansible.builtin.lineinfile:
        path: /etc/audit/rules.d/hardening.rules
        line: "-e 2"
        state: present
      when: auditd_immutable | bool
      notify: reload audit rules
      tags: [auditd, immutable]

  handlers:
    - name: restart ssh
      ansible.builtin.systemd:
        name: ssh
        state: restarted

    - name: restart chrony
      ansible.builtin.systemd:
        name: chrony
        state: restarted

    - name: restart rsyslog
      ansible.builtin.systemd:
        name: rsyslog
        state: restarted

    - name: restart fail2ban
      ansible.builtin.systemd:
        name: fail2ban
        state: restarted

    - name: reload sysctl
      ansible.builtin.command: sysctl --system
      changed_when: false

    - name: reload audit rules
      ansible.builtin.command: augenrules --load
      changed_when: false
```

***

## templates/sshd-hardening.conf.j2

```jinja
# Managed by Ansible — do not edit by hand
# Drop-in loaded by /etc/ssh/sshd_config

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

# PAM (account/session)
UsePAM yes
PubkeyAuthentication yes
PasswordAuthentication {{ "yes" if ssh_password_auth else "no" }}
KbdInteractiveAuthentication no

# Sessions
ClientAliveInterval 300
ClientAliveCountMax 3
MaxSessions 10
MaxStartups 10:30:60

# Banner
Banner /etc/issue.net

# Strong algorithms only
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,ecdh-sha2-nistp521,ecdh-sha2-nistp384,ecdh-sha2-nistp256,diffie-hellman-group-exchange-sha256
```

***

## templates/sysctl-hardening.conf.j2

```jinja
# Managed by Ansible — see linux-server-hardening guide §4

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

# ─── IPv6 hardening ───────────────────────────────────────
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

***

## templates/audit-hardening.rules.j2

```jinja
# Managed by Ansible — see linux-server-hardening guide §10
# Order matters: -e 2 (set by playbook when auditd_immutable=true) MUST be last.

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
-a always,exit -F arch=b64 -S adjtimex,settimeofday -k time-change
-a always,exit -F arch=b64 -S clock_settime         -k time-change
-w /etc/localtime    -p wa -k time-change

# ─── DAC permission changes ─────────────────────────────
-a always,exit -F arch=b64 -S chmod,fchmod,fchmodat                   -F auid>=1000 -F auid!=4294967295 -k perm_mod
-a always,exit -F arch=b64 -S chown,fchown,fchownat,lchown            -F auid>=1000 -F auid!=4294967295 -k perm_mod
-a always,exit -F arch=b64 -S setxattr,lsetxattr,fsetxattr,removexattr -F auid>=1000 -F auid!=4294967295 -k perm_mod

# ─── Unauthorized access attempts ───────────────────────
-a always,exit -F arch=b64 -S open,openat,creat,truncate,ftruncate -F exit=-EACCES -F auid>=1000 -F auid!=4294967295 -k access
-a always,exit -F arch=b64 -S open,openat,creat,truncate,ftruncate -F exit=-EPERM  -F auid>=1000 -F auid!=4294967295 -k access

# ─── Mount events ───────────────────────────────────────
-a always,exit -F arch=b64 -S mount -F auid>=1000 -F auid!=4294967295 -k mounts

# ─── Network env ────────────────────────────────────────
-w /etc/hosts        -p wa -k system-locale
-w /etc/network/     -p wa -k system-locale
-w /etc/netplan/     -p wa -k system-locale
```

***

## templates/fail2ban-jail.local.j2

```jinja
# Managed by Ansible — see linux-server-hardening guide §12
[DEFAULT]
bantime  = {{ fail2ban_bantime }}
findtime = {{ fail2ban_findtime }}
maxretry = {{ fail2ban_maxretry }}
backend  = systemd
ignoreip = {{ fail2ban_ignoreip | join(' ') }}

[sshd]
enabled = true
```

***

## templates/unattended-upgrades.conf.j2

```jinja
// Managed by Ansible — see linux-server-hardening guide §13

Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Automatic-Reboot "{{ 'true' if unattended_auto_reboot else 'false' }}";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::MinimalSteps "true";

Unattended-Upgrade::Mail "{{ unattended_mail }}";
Unattended-Upgrade::MailReport "on-change";
```

***

## templates/pam-faillock.j2

```jinja
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

***

## How to use it

Two ways to run it: straight from the **command line (CLI)**, or via [[my-awx-stack|AWX]] pulled from [[gitlab-setup|Gitlab]] (check out both my guides if you want to implement this "real production" approach). 

Expand the one you need.

> [!EXAMPLE]- With Ansible CLI
> **One-time prerequisites on your control node**
> ```bash
> # Ansible itself + the collections used in the playbook
> sudo apt install -y ansible
> ansible-galaxy collection install community.general
> ansible-galaxy collection install ansible.posix
> ```
>
> **Dry-run first (always)**
> ```bash
> ansible-playbook linux-hardening.yml --check --diff
> ```
> Reads what would change without applying. **Always do this first on a new host**, especially with PAM and SSH: verify the diff for `/etc/pam.d/su`, `/etc/securetty`, and the sshd drop-in before committing.
>
> **Apply the full playbook**
> ```bash
> ansible-playbook linux-hardening.yml
> ```
>
> **Apply just one section (using tags)**
> ```bash
> # Only the firewall
> ansible-playbook linux-hardening.yml --tags firewall
>
> # Just sysctl + SSH + sudo
> ansible-playbook linux-hardening.yml --tags "sysctl,ssh,sudo"
>
> # Everything except auditd (rules can be noisy on first apply)
> ansible-playbook linux-hardening.yml --skip-tags auditd
> ```
>
> **Make auditd immutable (only after the ruleset is stable)**
> ```bash
> # In group_vars/hardened_servers.yml: set auditd_immutable: true
> ansible-playbook linux-hardening.yml --tags auditd
> ```
> After this, `auditctl` can no longer modify rules until the next reboot. **Don't apply this on a new host you're still tuning.**
>
> **Opt a host out of automatic security updates**
> ```bash
> # In group_vars/hardened_servers.yml (or host_vars/<host>.yml for one host):
> #   unattended_upgrades_enabled: false
> ansible-playbook linux-hardening.yml --tags updates
> ```
> The playbook will stop and disable the timer on the next run. Set the flag back to `true` to re-enable.

> [!EXAMPLE]- With Ansible AWX
> The playbook lives in GitLab under a path, e.g. `automation/playbooks/LinuxHardening/` and is pulled by an AWX **Project**: see [[awx-gitlab-wiring|Connect AWX to GitLab]] for the wiring. The CLI flags that you see in the Ansible CLI example, are mapped directly to the fields of a **Job Template**.
>
> **Set up the Job Template**: *Resources → Templates → Add → Job Template*:
> - **Project**: `Playbooks` · **Playbook**: `LinuxHardening/linux-hardening.yml`
> - **Inventory**: one that contains the `hardened_servers` group (this playbook targets `hosts: hardened_servers`, but you could have different groups of machines of course)
> - **Credentials**: the **Machine** credential for the targets
> - **Instance Groups**: `execution-vms` (run on the execution node)
>
> **Dry-run first (always)**: set **Job Type → Check** and enable **Show Changes**: that's the `--check --diff` above. Launch once and read the diff before a real run!
>
> **Apply the full playbook**: set **Job Type → Run** → **Launch**.
>
> **Just one section (tags)**: use the **Job Tags** / **Skip Tags** fields (tick *Prompt on launch* to choose per-run):
> - Job Tags `firewall` → only the firewall
> - Job Tags `sysctl,ssh,sudo` → those three
> - Skip Tags `auditd` → everything except auditd
>
> **Toggles like `auditd_immutable` / `unattended_upgrades_enabled`**: they're variables, set them in the inventory's `group_vars` for the `hardened_servers` group, or pass them in the Job Template's **Variables** as extra vars (but I don't recommend to do that):
> ```yaml
> auditd_immutable: true
> ```
> For a nicer UI, you can consider to expose them as a **Survey** on the Job Template (a checkbox per option).
>
> **Same cautions as the CLI**: dry-run on a new host first, keep `disable_password_auth: false` until key login works, and don't set `auditd_immutable: true` while you're still tuning.

***

## Safety considerations

> [!CAUTION]
> **First run on a production host**: open a second SSH session before applying, just in case. The sshd drop-in is validated with `sshd -t` before being installed (so a typo can't lock you out), but always have an out-of-band path (console, BMC, second open shell) just in case.

> [!IMPORTANT]
> **`ssh_password_auth`** defaults to `true` for safety. Switch it to `false` in `group_vars/` **only after** every user on every host has a working public key: otherwise the next run locks out everyone without keys.

> [!INFO]
> **The `wheel` group is intentionally empty** after the playbook runs: `su` becomes unusable until you add a user. This is deliberate (forcing everyone through `sudo`). If you actually want one user to retain `su` access, add them manually with `usermod -aG wheel <user>` after the run.

***

## What to do next

- Apply the playbook to a fresh VM, then run `lynis audit system` and `oscap eval` to measure your CIS L1 coverage.
- Add an Ansible CI job (e.g. GitHub Actions or Jenkins) that re-runs the playbook in `--check` mode weekly: any `changed` report = configuration drift on a host, investigate and re-apply.
