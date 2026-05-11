---
title: "Pre-upgrade checks: prepare a Linux system before apt upgrade"
tags:
---

Updating a Linux system is usually boring: `apt update && apt upgrade -y`, ten minutes, done. 

Until the time it isn't: kernel that won't boot, `sshd_config` rewritten, domain lost, iptables rules vanished, a service that comes up failed and you can't tell whether it was failed *before* the upgrade or because of it... and so on.

The trick isn't trying to make upgrades "safe" (you can't, fully), but to lower the risk as much as possible, while making them **reversible** and **diagnosable**.

If you have Uyuni or Ansible for managing your systems, these steps can definitely become the *pre-task* checks of your upgrade playbook.

This is the general approach I follow:

1. **Understand the server’s role**: this may sound obvious, but when you work in a large company with 2000+ systems to manage, you often don’t know the purpose of every single machine off the top of your head... but you need to before you launch a system upgrade.
2. **Create a snapshot**: either a hypervisor snapshot, or a filesystem snapshot if the server is physical and uses something like LVM (even though I’m personally not a big fan of LVM and I'll probably explain why another time).
3. **Save the current system state**: capture and backup what the system looks like _before_ the upgrade, so you can compare it with the _after_ state and have a clear rollback path if anything breaks. This also includes backing up configurations. Many times important things change after system upgrades, for example the netplan, or interfaces names, and we want to know it! 
4. **Run pre-flight checks**: basically confirm if the system is in a sane and healthy state _before_ starting the upgrade, this way you can abort early if something is wrong.


## 1. Understand the server's role

The docs are missing, the only thing the ticket says is *"please upgrade it"*. 

Before you touch `apt`, you need to know what's on it, otherwise you're going to upgrade the kernel of a database server right while it's serving customers... and only realize it once they start calling you during your on-call shift (not fun).

The mental model I follow is **outside-in**: figure out first what the world *sees* (IP, DNS, ports, certificates...), then what's *running* (services, containers...), then who *uses* it (logins, cron, application data...). 
### What is this machine exposing to the world?

```sh
ip -br -c a # does it have a public IP address? (or curl -s ifconfig.me)

host <SERVER_PUBLIC_IP> # if it has got a public IP, we can try to reverse-DNS
# if the domain has got a PTR record, we'll find the domain from the public IP!

iptables -nvL ; iptables -t nat -nvL # does it have open ports?

sudo find /etc /opt /usr/local -type f \( -name "*.crt" -o -name "*.pem" -o -name "*.cer" -o -name "*.key" \) # are there any certificates?

ss -tulpn # which programs are running?
```

`ss -tulpn` is the single most informative command on a server you don't know:

- Port 80/443 + nginx → web stack
- Port 3306 → MySQL (or port 5432 → Postgres;); 
- Port 25/465/587 → mail 
- ...

The *programs* listening on those ports tell you automatically what's installed in the server.

### What's running?

```sh

systemctl list-units --type=service --state=running # active services

systemctl list-timers --all # scheduled jobs (systemd side)

ps auxf # see process tree with parents

cat /proc/<PID_FOUND_WITH_PS>/cmdline # advanced! If you found an nginx process with pid 825 by using ps auxf, then you can check every PID detail
# for example, cmdline tells you the command used for launching the process!
```

Then you can cross-reference with `ss -tulpn` which process is listening on the port. 

This maps "port 443 is open" to "nginx is serving traffic from `/etc/nginx/sites-enabled/example.conf`" and boom, you've just found the application.

Also you can check for anything specific, for example:
```
docker ps -a 2>/dev/null # containers, if any

virsh list --all 2>/dev/null # VMs, if any

...
```
### What was installed deliberately?

```sh

apt-mark showmanual # packages the previous admin explicitly chose

ls /opt/ # third-party / vendor software lives here

ls /usr/local/bin /usr/local/sbin # binaries installed outside apt

ls /etc/systemd/system/*.service # custom unit files (NOT distribution defaults)

```

`apt-mark showmanual` is gold: it filters out the noise of auto-installed dependencies and gives you the *intentional* package list. If you see `nginx`, `certbot`, `postgresql-14`, `redis-server`, you've got the stack at a glance.

### Who uses it?

```sh

last -n 30 # recent logins (auth.log retention permitting)

who # active sessions right now

getent passwd | awk -F: '$3 >= 1000' # human users (UID ≥ 1000 are users on Debian/Ubuntu)

getent group sudo # who can become root

ls -la /home # actual home directories on disk

ls -lt /etc | head -20 # most recently edited config files, very helpful!

```

### Where does the data live?

```sh
ncdu / # I highly recommend to install it (apt install ncdu) (otherwise du -h / --max-depth=1)

df -hT # filesystems + free space

```

>[!TIP]
>`/var/lib/mysql`, `/var/lib/postgresql`, `/var/lib/docker/volumes`, `/var/lib/lxd`, `/var/spool/mail`... are very popular. 
>
>if `/var/lib/postgresql` exists and is 80 GB, treat the upgrade like a database operation: snapshot first, verify replication (if any), plan the restart window.

### What runs on a schedule?

```sh

# Cron at the system level

ls -la /etc/cron.{hourly,daily,weekly,monthly}/ /etc/cron.d/

# Cron per user

for u in $(cut -f1 -d: /etc/passwd); do

out=$(crontab -u "$u" -l 2>/dev/null) && [ -n "$out" ] && echo "=== $u ===" && echo "$out"

done

# Systemd timers (the modern equivalent)

systemctl list-timers --all

```

Cron jobs are where business logic hides: backups at 03:00, sync scripts every 10 minutes, certbot renewals... Knowing *what* runs *when* prevents you from rebooting exactly in the middle of the nightly backup.

### Recent activity

```sh

journalctl --since "24 hours ago" -p warning # warnings + errors of the last day

journalctl -u <service-found-above> -n 100 # what a specific service has been saying

ls -lt /var/log/ | head -20 # which log files are still being written

```

A service that has been logging errors for 6 hours straight probably is not a service you want to disrupt with an upgrade, at least until you've understood the error.

> [!TIP]
>Journalctl is very powerful, these are only examples but you may want to check out the detailed explanation as soon as I release it.

### Final script: 00-server-recon.sh

If you want a single script that does everything that I mentioned, [here you have it](00-server-recon.sh). 

Read the output carefully. 

Anything you don't recognise is something to investigate before you start.


## 2. Create a snapshot

This is probably the most important step in the list, because it lets you instantly roll back in case anything goes wrong.

> [!IMPORTANT]
>A snapshot is not a backup of *data*. It's a snapshot of *the machine's current state*. Don't skip your normal backups!

### Hypervisor snapshot

If the system is a VM, then you can easily take a snapshot of it's full state (either Disk or Disk + RAM) directly on the Hypervisor.

A disk-only snapshot is faster, but if you ever need to restore it, the VM will be powered off and then powered on again, since the machine’s RAM is not included in the snapshot. This is the most “state-safe” type of snapshot.

A disk + RAM snapshot, on the other hand, is slower, but it can fully restore the machine’s state. The VM will resume exactly from the point in time when the snapshot was taken, as if nothing had happened.

> [!IMPORTANT]
> Delete the snapshot once the upgraded system has been stable for 24-48h.

### FileSystem snapshot

If the system isn't a VM (bare metal) or you don't have hypervisor access, the next best safety net is a **snapshot at the filesystem layer**. 

Three popular options on Linux:

| Tech      | Where it lives                    | Snapshot is...                  | Restore                        |
| --------- | --------------------------------- | ------------------------------- | ------------------------------ |
| **LVM**   | block layer, below the filesystem | COW (copy-on-write) of an LV    | `lvconvert --merge` + reboot   |
| **ZFS**   | the filesystem itself             | atomic, instant, near-zero cost | `zfs rollback` (instant)       |
| **Btrfs** | the filesystem itself             | atomic snapshot of a subvolume  | swap default subvolume, reboot |

The idea is the same in all three: take a snapshot of the root filesystem (or of the relevant subvolume), run the upgrade, and if anything is broken roll back the filesystem to the snapshot.

Important notes:

- **No RAM is captured**: filesystem snapshots are disk-only, always. So in-memory state (open DB connections, dirty pages not yet flushed) is *not* part of the snapshot.
- **A snapshot is not a backup**: here even more! If the underlying disk dies, the snapshot dies with it. You still need real off-host backups.

For learning how to actually take, monitor, merge, and remove an LVM snapshot, see the dedicated [LVM guide]() (coming soon!).

> [!IMPORTANT]
> Delete the snapshot once the upgraded system has been stable for 24-48h: snapshots get progressively heavier as the live system diverges from the snapshot. 
> 
> **Don't keep them as long-term backups.**

## 3. Save the current system state

As I mentioned earlier, besides the actual snapshot, we want to manually backup the current system state**: this way we know how it looks like _before_ the upgrade, and we can compare it later with the _after_ state and have a diff status.

### 01-system-snapshot.sh

To do that I created a script that you can use, you can find it [here](01-system-snapshot.sh).

The point of this script is simply to capture the general state of the system: its very hard to reconstruct later system level changes, if you didn't save them before: what the network looked like (interfaces name can change in Linux), netplan configurations, what `/etc/fstab` actually mounted, which services were active, which packages were held and so on.

Besides that, it also backups /etc, as it's the folder that usually contains every configuration file.

During `apt upgrade`, dpkg may prompt to overwrite a config file (`Y/I/N/O/D/Z`), and if a script answers "Y" by accident, your custom `sshd_config`, `nginx.conf`, `php.ini` could revert to upstream defaults. 

A pristine `/etc` archive saves you in these scenarios (even tho we'll also see how to prevent that configuration overwrites happen in the first place).


## 4. Run pre-flight checks

These are the final things to check before starting the actual upgrade procedure, and they answer the question "is it safe to run apt right now?".

### Disk space

```sh
df -hT
```

This is the #1 cause of mid-upgrade failure.

On Ubuntu `/boot` is ~1 GB and fills up after a few kernel upgrades. If it's >70% full, run `apt autoremove --purge` first to evict old kernels — otherwise the new kernel install will fail mid-way and leave the system inconsistent.

### What's about to be installed

```sh
apt update
apt list --upgradable
```

Skim it. 

If you see `linux-image-*`, `libc6`, `grub*`, `openssh-server`, `docker-ce` — those are the upgrades worth being awake for.

### Reboot already pending?

```sh
[ -f /var/run/reboot-required ] && cat /var/run/reboot-required.pkgs
```

If something already required a reboot *before* this upgrade, the upgrade inherits it. 

You should definitely consider to reboot now to start from a clean state.

### SSH safety

Before you trigger any reboot on a remote box, validate that SSH is going to come back up:

```sh
sshd -t                              # the config file is syntactically valid
systemctl restart ssh                # it actually restarts NOW (not just "is-enabled")
systemctl is-active ssh              # it's effectively up after the restart
```

If any of these fails, **abort the reboot**. 

We'll check this again even in the upgrade phase, before rebooting the server.

>[!DANGER]
>A machine still on the old kernel but reachable, is a much better problem than a machine that booted cleanly but with a broken sshd: in the latter, you have to access the Hypervisor's console (if the system is a VM) or the KVM console directly via BMC/IPMI (if the host is physical), then manually reset the root password to access again! 

## 5. Extra steps

- [ ] Do you have a monitoring tool (e.g. Nagios, CheckMK, PRTG...)?
   If so, remember to put the host in downtime before starting the actual upgrade.
