---
title: "3. Upgrade rollback: recovering from a bad upgrade"
tags:
  - Maintenance
---

Despite all the [pre-upgrade checks](linux-pre-upgrade-checks), the safe defaults in the [patch script](linux-patch-management), and the [post-upgrade verification](linux-post-upgrade-checks), every now and then an upgrade goes south: a kernel that won't boot, a service that crash-loops, a config file silently overwritten. This page is the survival manual for that day.

The rollback strategy depends on **what's broken** and **what you have ready**: an LVM snapshot makes life easy, an empty `/root` makes it harder. 

Pick the right tool from the decision tree below before reaching for the keyboard.

> [!IMPORTANT]
> Most of this page is targeted at **[patch management](linux-patch-management)**. 
> 
> [Release upgrades](linux-release-upgrade) (e.g. Ubuntu 22.04 → 24.04) have *no official downgrade path*.


## Understand which rollback you need

Quick triage based on the symptoms:

| Symptom                                                      | Best rollback                                                                                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The machine **won't boot** at all (kernel panic, GRUB loops) | [Hypervisor snapshot restore](#2-hypervisor-snapshot-restore) or [boot the previous kernel from GRUB](#5-boot-the-previous-kernel-and-pin-it) (if the previous one is still installed) |
| The machine boots but **everything is broken**               | [Hypervisor or filesystem snapshot rollback](#3-filesystem-snapshot-rollback-lvm--zfs--btrfs)                                                                                          |
| **One specific service / app** regressed (rest is fine)      | [Downgrade that single package](#6-downgrade-a-single-package)                                                                                                                         |
| A **config file** got overwritten (Y/I/N prompt answered Y)  | [Restore that file from the `/etc` backup](#4-restore-an-overwritten-config-file-from-the-etc-backup)                                                                                  |
| The **new kernel** is unhappy on this hardware               | [Boot the previous kernel and pin it](#5-boot-the-previous-kernel-and-pin-it)                                                                                                          |


## 1. Hypervisor snapshot restore

If you took a hypervisor snapshot before the upgrade, **this is always the right answer**. 

It's a single click on the provider panel, the disk goes back to its byte-for-byte state, the VM reboots (if it's a disk-only snapshot), you're done in two minutes.



## 2. Filesystem snapshot rollback 

If the host is bare metal and you prepared a filesystem snapshot before the upgrade, you can roll back disk state to that point.

The main filesystems that support snapshots are LVM, ZFS and Btrfs.

For now, this guide focuses on LVM, which is the most common of the three.

> [!IMPORTANT]
> Filesystem snapshots are **disk-only**. After the rollback, the system needs a reboot, there's no way to revert in-memory state.

```sh
# List snapshots
lvs

# Merge the snapshot back into the original LV
lvconvert --merge /dev/<vg>/<snap_lv>

# The merge is deferred to next reboot for the root LV
reboot
```

On reboot, the system comes back at the pre-upgrade state and the snapshot LV is automatically removed.


## 3. Restore an overwritten config file from the `/etc` backup

Since we took the `etc.tar.gz` backup with the [pre-upgrade snapshot script](linux-pre-upgrade-checks), we just need to copy the old configuration of the broken application back:

```sh
# Extract the pre-upgrade /etc to a scratch directory
mkdir -p /tmp/etc-pre
tar -xzf /root/pre-upgrade-<date>/etc.tar.gz -C /tmp/etc-pre

# Compare the affected file
diff /tmp/etc-pre/etc/nginx/nginx.conf /etc/nginx/nginx.conf

# Restore it (after confirming the diff is what you expect)
cp /tmp/etc-pre/etc/nginx/nginx.conf /etc/nginx/nginx.conf

# Reload / restart the affected service
systemctl reload nginx
# or
systemctl restart nginx
```

> [!IMPORTANT]
> Don't blindly restore the entire `/etc`. Some files *should* be the new upstream version (e.g. `/etc/issue.net`, `/etc/motd`, package update notifications). 
> 
> Always `diff` first, restore the ones you actually customised.

## 4. Boot the previous kernel and pin it

If the new kernel is unstable on this hardware (which happens more on bare metal than on VMs) but the rest of the upgrade is fine, you don't need to roll back everything: just boot the previous kernel and keep everything else.

### Boot the old kernel manually

At the next boot, hold `Shift` (BIOS) or `Esc` (UEFI) right after the firmware splash to enter the GRUB menu, then:

```
Advanced options for Ubuntu  →  Ubuntu, with Linux 5.15.0-176-generic
```

Pick the version that was running before the upgrade (you noted it in the pre-upgrade `sysinfo.txt`, right?).

### Make the old kernel the new default

Once booted on the old kernel:

```sh
# List the GRUB menu entries
awk -F\' '/menuentry / { print $2 }' /boot/grub/grub.cfg

# Pin it as default (replace the string with the exact menuentry name)
grub-set-default "Advanced options for Ubuntu>Ubuntu, with Linux 5.15.0-176-generic"
update-grub
```

### Prevent the new kernel from being chosen at the next upgrade

```sh
apt-mark hold linux-image-<new-version>-generic \
                linux-headers-<new-version>-generic \
                linux-modules-<new-version>-generic
```

`apt-mark showhold` confirms the hold is in place.

Later, when a *newer* kernel arrives that fixes the issue, you can remove the hold (`apt-mark unhold ...`) and try again!


## 5. Downgrade a single package

When a single package's update broke a specific service (the rest of the system is fine), downgrade only that one.

### Find the previous version

```sh
# All versions available in the configured repos
apt-cache policy <package>

# Versions of the package that you have in the local apt cache
ls /var/cache/apt/archives/ | grep <package>
```

### Downgrade

```sh
apt install <package>=<old-version>
# example:
apt install nginx=1.18.0-6ubuntu14.4
```

Apt will recompute dependencies, and sometimes it wants to downgrade related packages too. 

So read the output carefully before confirming.

### Pin the version

Otherwise the next `apt upgrade` re-upgrades it.

```sh
apt-mark hold <package>
```

> [!TIP]
> If you also need to downgrade dependencies and `apt` can't find the old versions, look at [snapshot.debian.org](https://snapshot.debian.org/) (Debian) or [launchpad.net package page](https://launchpad.net/ubuntu) (Ubuntu) for the full version history, including the `.deb` file you can download and install with `dpkg -i <file>.deb`.

## 6. Release upgrade rollback: the hard truth

**There is no official downgrade path** between Ubuntu/Debian releases. 

Once `apt full-upgrade` has installed the new libc, the new init, the new kernel, the new package versions, the old ones are gone from the active repos.

This is why its very important to [[linux-release-upgrade#^check|check the release notes first]].

What you can do:

- **Hypervisor / filesystem snapshot restore**: the only reliable rollback. 
- **Reinstall the previous release from scratch**: provision a fresh VM with the old Ubuntu/Debian version, restore your data from a backup, and reconfigure. 
   
   This is the painful but reliable route when there's no snapshot.

What you should NOT do:

- Edit `/etc/apt/sources.list` to point at the previous release and run `apt full-upgrade`: the system is now built around a new libc6 version, so pointing at a repo with a previous version won't downgrade everything, it'll just create an unbootable mess of half-old, half-new packages.


## After any rollback

Whatever rollback you used, finish up with:

1. **Identify why** the upgrade broke: release notes, broken package version, hardware-incompatible kernel, custom configs. Don't re-attempt the upgrade without knowing the answer.
2. **Re-run the [post-upgrade checks](linux-post-upgrade-checks)** even after a rollback, to confirm the system really is back to the pre-upgrade state and nothing leaked through.
3. **Keep the broken state's logs** somewhere safe: they're the only evidence of what went wrong, and you'll want them when you retry.
