---
title: "2. Post-upgrade checks: verify a Linux system after an upgrade"
tags:
  - Maintenance
---

The upgrade is done... but the job still isn't over. 

A successful `apt upgrade` only means the package manager exited with code 0: it doesn't tell you that sshd actually starts at boot on the new kernel, that nginx is still listening on 443, that the iptables rules are loaded, that Docker brought its containers back up. 

**That's what post-upgrade verification is for**.

This page works for both [patch management](linux-patch-management) and [release upgrade](linux-release-upgrade): the core checks are the same. Release-upgrade-only checks are flagged with a callout at the end.

The general approach I follow is the mirror of the pre-upgrade flow:

1. **Confirm the system is alive and healthy**: the basics: uptime, running kernels...
2. **Diff against the pre-upgrade snapshot**: this is where the work you did *before* the upgrade pays off. Re-run the recon script and compare.
3. **Check the workloads**: containers, VMs, application-level health.
4. **Inspect recent logs**: surface anything that's been failing since the reboot.
5. **Final checks**: confirm no pending reboot, no half-installed dpkg state.
6. **Extras:** remove the host from monitoring downtimes, remove snapshots...

> [!TIP]
> If anything went wrong and the system is in a broken state, time to consult the [upgrade rollback procedure](linux-upgrade-rollback) (coming soon).


##  <input type="checkbox"> 1. Confirm the system is alive and healthy

If you're reading this prompt, the machine is at least booting and accepting SSH: which is already 80% of the win on a remote VPS. 

The remaining 20%:

```sh
uptime                          # how long the system has been up
uname -r                        # currently running kernel
hostnamectl                     # one-shot OS + kernel + arch + hypervisor recap
```

What to look for:

- **`uptime`** should be in *minutes*, not days. If it's still showing days, the reboot didn't happen — either it wasn't required (legit) or the script aborted at the SSH safety gate (something is broken, go check the logs of the maintenance script).
- **`uname -r`** should match the *newest* `linux-image-*` package installed. If you see the old version, the new kernel is installed but GRUB booted the old one. Check `/etc/default/grub` and `update-grub`.
- **`hostnamectl`** confirms the distro/kernel haven't drifted from what you expected. After a release upgrade, this is where you confirm you really are on Ubuntu 24.04 and not still on 22.04.


##  <input type="checkbox"> 2. Diff against the pre-upgrade snapshot

This is the most powerful single check, and it's the reason we ran [the system snapshot script](01-system-snapshot.sh) *before* the upgrade.

Re-run the script now and `diff` the two folders:

```sh
# Re-run the same snapshot script, into a new folder
/root/01-system-snapshot.sh                            # outputs to /root/pre-upgrade-<new-timestamp>

# Compare with the pre-upgrade snapshot you took earlier
diff -r /root/pre-upgrade-<pre-date>  /root/pre-upgrade-<post-date>
```

Any difference here is a candidate regression. 

The interesting files:

- **`sysinfo.txt`** → kernel version diff confirms the upgrade landed.
- **`services.txt`** → **the big one**. 
  
  If a service is *newly* failed (was running before, is failed now) you have a real regression. If it was *already* failed (you noted this during the pre-upgrade, didn't you?), it's not the upgrade's fault.
- **`storage.txt`** → mounts that disappeared = a bind-mount or NFS that didn't reconnect at boot.
- **`network.txt`** → interface names (`enp0s3` → `enx...` happens), netplan changes, **iptables rules count**.
- **`holds.txt`** → held packages should still be held; if not, something got **force-upgraded**.


> [!TIP]
> `diff -r` is very difficult to read. 
> 
> I suggest to [[git-basics#^delta|install delta]] for the file-by-file comparison, and use it this way: `diff -ru old_folder new_folder | delta`
> 
> ![[git-basics#^delta|install delta]]


##  <input type="checkbox"> 3. Check the workloads

Whatever was running on this server before should be running on it now.

If you ran the recon script, you should have a pre-upgrade folder with a useful recap of the server: this way you know immediately what to check. 

You can't re-run it and use it for diff comparison like we did with the system-snapshot script: that's not its purpose, since many of those files change during an update and that's expected, but it can be useful to check the pre-upgrade folder for fast cross-referencing.

Here are just a few examples.

### Resource usage

```sh
# Memory + swap
free -h
swapon --show                          # is swap active? how full?

# CPU snapshot + load context
uptime                                 # load average over 1/5/15 min
nproc                                  # number of CPUs (if load average is 4 on 8 cores = OK, on 2 cores... ouch)
vmstat 1 5                             # 5 samples in 5s: CPU + IO + memory all in one

# Live (interactive)
htop                                   

# Top consumers right now
ps aux --sort=-%mem | head -10         # heaviest by RAM
ps aux --sort=-%cpu | head -10         # heaviest by CPU

# OOM events since boot (the silent killer post-upgrade)
dmesg --level=err -T | grep -i "killed process\|out of memory" || echo "no OOM events"
```

### Listening sockets

```sh
ss -tulpn
```

You can cross-reference with the `pre-upgrade/recon-exposure.txt` (if you ran the recon script): same programs, same ports. 

If port 12345 used to be a `docker` container in your server and now it's nothing, docker or the container itself didn't come back up, check it!

### Application-level health

For each web app the server is hosting:

```sh
curl -sI https://your-app.example.com          # expect 200/301/302
curl -sI http://localhost:8080/healthz         # whatever the app exposes
```

A successful TCP connection (`ss`, `telnet`...) tells you the daemon is alive. 

A successful HTTP request tells you the *application* is actually alive. 

Two different things.


##  <input type="checkbox"> 4. Inspect recent logs

The system is up... but is it complaining?

```sh
# Errors since the last boot
journalctl -b -p err --no-pager

# Warnings in the last hour
journalctl --since "1 hour ago" -p warning --no-pager

# Kernel messages (driver issues, hardware that didn't come back)
dmesg --level=err,warn | tail -50
```


##  <input type="checkbox"> 5. Final cleanup checks

The system is verified: three quick sanity checks before declaring victory.

```sh
# 1. No pending reboot (should be absent right after the reboot)
ls /var/run/reboot-required 2>/dev/null

# 2. dpkg is in a clean state (no half-installed packages)
dpkg -l | grep -v ^ii | grep -v ^un | head
```

In case of a release upgrade done with `do-release-upgrade` (Ubuntu) or `apt full-upgrade` (Debian), there are also extra checks to do:

```sh
# Confirm you're on the new release
cat /etc/os-release

# sources.list was rewritten to point at the new release — sanity check
cat /etc/apt/sources.list /etc/apt/sources.list.d/*.list

# Release-upgrade leaves its own log
ls -la /var/log/dist-upgrade/
less /var/log/dist-upgrade/main.log

# Packages that the release-upgrade removed (often abandoned upstream)
grep -i 'remove' /var/log/dist-upgrade/main.log

# Configuration files that got the .ucf-old / .dpkg-old / .dpkg-dist treatment
find /etc -name "*.dpkg-old" -o -name "*.dpkg-dist" -o -name "*.ucf-old" 2>/dev/null
```

> [!TIP]
> The last command can be very useful: `.dpkg-dist` files are the new upstream defaults of configs *you had customised*. The upgrade kept your version, but the new defaults sit next to them: you could consider a diff and merge by hand.


##  <input type="checkbox"> 6. Extras

A few non-technical things easy to forget:

- **Remove the host from monitoring downtime**: Nagios, CheckMK, PRTG...
- **Remove Hypervisor/FS snapshots**: if all checks above pass, schedule the deletion of the hypervisor / filesystem snapshots after 24-48h of stability. Keeping them longer is a bad idea (snapshots grow heavier the more the live system diverges).
- **Archive the logs**: `/root/pre-upgrade-<date>/` and the upgrade logs.
- **Note what changed**: kernel version, distro release, surprise config files in `.dpkg-dist`. 
  Future-you will thank present-you.
