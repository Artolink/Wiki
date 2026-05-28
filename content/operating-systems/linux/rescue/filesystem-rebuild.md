---
title: "Filesystem rebuild: recreate partitions and restore the data"
tags:
---
## Overview

This guide covers the **worst-case recovery scenario**: the **partition table itself is damaged or wrong**: not just GRUB, not just a broken config file. 

Typical situations:

- A partition was accidentally deleted (`fdisk d`, the wrong `parted rm`, an automated provisioning script gone rogue).
- `/boot` is missing entirely (the partition that *should* be there isn't, or it's the wrong size / wrong filesystem).
- The disk was partly overwritten by another OS installer that didn't ask the right questions.
- An unclean disk swap left the partition table in an inconsistent state.

In all these cases, [[operating-systems/linux/grub-rescue|GRUB rescue]] alone is not enough: you have to rebuild the partition layout **before** GRUB has anywhere to be installed.

> [!DANGER]
> **This procedure can destroy all data on the disk if you make a single typo.** 
> 
> The commands here (`fdisk`, `mkfs`, `dd`) are immediate and irreversible. 
> 
> There is no "Are you sure?" safety net for most of them. 

> [!IMPORTANT]
> **Try [[#Before you wipe anything — try testdisk first|`testdisk`]] before any of this.** It can rebuild a destroyed partition table from on-disk signatures, in most cases recovering the original layout *without* writing a single byte of user data. Don't skip Step 0.

***

## Decision tree

Use this to choose your path before doing anything destructive:

| Situation                                                                                                                           | What to do                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Partition table is wrong, but **all data should still be on disk** (you just `fdisk d` and `w`-saved without writing anything else) | **`testdisk`**: non-destructive, recovers the table                        |
| Partition table is wrong **and** a partition was reformatted on top                                                                 | Image the disk first (`dd`), then **`testdisk` + file carving**            |
| Partition table is wrong **and** data has been overwritten by new partition contents                                                | **Restore from external backup** (this guide's Steps 1-7)                  |
| `/boot` is missing but root partition is intact                                                                                     | **Recreate just `/boot`** (this guide's Steps 4-7, skip the rsync of root) |
| Disk is dead at the hardware level (SMART errors, read failures)                                                                    | Stop. Send to data recovery, this guide can't help                         |

***

## Step 0. Try `testdisk` first

`testdisk` is an interactive partition recovery tool that reads the disk surface and reconstructs the partition table from filesystem signatures. 

It's open source, lives in every distro's repos, and is **the first thing to try** before reaching for `fdisk`.

> [!info]- The 5-minute attempt
> Boot a Live USB, then:
> 
> ```bash
> sudo apt install -y testdisk    # or yum / dnf / pacman
> sudo testdisk /dev/sda
> ```
> 
> Walk through: **Select partition table type** → usually *Intel* (MBR) or *EFI GPT* → **Analyse** → **Quick Search**. If it finds your old partitions, write them back with **Write**.
> 
> A successful `testdisk` run is a 5-minute job. 
> 
> A failed `testdisk` run wastes nothing: the disk is unchanged and you proceed to the manual rebuild below.

> [!TIP]
> If `testdisk` finds *most* of the partitions but misses one, run **Deeper Search** before giving up. It's slower (can take hours on a multi-TB disk) but reads every sector instead of just signature locations.

***

## Step 1: Boot from rescue media

You need to be running on something *other* than the broken disk. 

The classic options:

> [!info]- Live USB (laptops, desktops, VMs with USB passthrough)
> Boot from a Live USB of any modern distro: same procedure as [[hardware/enter-the-UEFI-BIOS|How to enter the UEFI / BIOS]] to override the boot order. 
> 
> Choose "Try Ubuntu" / "Live session" (not "Install").

> [!info]- Out-of-band rescue (servers with iDRAC / iLO / IPMI)
> Most enterprise server BMCs let you mount an ISO over the network ("virtual media" / "remote KVM"). 
> 
> Mount a rescue ISO, set "next boot from virtual media", and reboot: you'll get the same Live environment as a physical USB, but via the management network.

> [!info]- Provisioning-system rescue mode (bare-metal management platforms)
> Many bare-metal lifecycle tools like MAAS expose a "rescue mode" that boots the machine into a minimal in-memory Linux from the network (PXE / iPXE). 

Once you have a shell on the rescue environment, you control the machine without anything mounted from the broken disk.

***

## Step 2: Image the disk (insurance copy)

**This is non-negotiable** if the data on the disk has any value at all. 

Before any destructive write, take a binary image of the affected disk(s) to a separate location. 

If anything goes wrong from Step 3 onwards, this image lets you start over from the exact pre-rescue state.

> [!info]- Image to an external disk plugged into the rescue environment
> ```bash
> # /dev/sdX is the broken disk; /mnt/external is the external mount
> sudo dd if=/dev/sdX of=/mnt/external/disk-image.img \
>         bs=4M status=progress conv=noerror,sync
> ```

> [!info]- Image over the network to a second host (when no external disk is around)
> ```bash
> # On the rescue host
> sudo dd if=/dev/sdX bs=4M status=progress conv=noerror,sync \
>   | ssh user@backup-host "cat > /path/to/disk-image.img"
> ```
> 
> Slower than local imaging (limited by network throughput) but doesn't require external hardware. 
> 
> Run inside a `screen` or `tmux` session: multi-TB images take hours.

> [!WARNING]
> The destination filesystem must support large files (no FAT32 for >4 GB images: use `ext4`, `xfs`, or NTFS).

***

## Step 3: Back up the live data (rsync)

Even with the binary image from Step 2, restoring from `dd` is slow and gives you the broken state back. 

A **file-level** backup of the readable partitions is what you actually want to use during the rebuild.

Mount each readable partition and rsync its content to a backup location:

```bash
# Mount the broken root partition (read-only — paranoid mode)
sudo mount -o ro /dev/sdaN /mnt

# Start a screen / tmux session — rsync of a full root takes hours
screen -S backup

# rsync to an external disk or a remote host
sudo rsync -avxHAX --progress /mnt/ /mnt/external/sda-backup/

# Or to a remote host
sudo rsync -avxHAX --progress /mnt/ user@backup-host:/path/to/sda-backup/

# Detach from screen with Ctrl+A, then D — comes back with `screen -r backup`
```

The flags matter:

| Flag | Meaning |
|---|---|
| `-a` | archive mode (preserves permissions, ownership, symlinks, timestamps) |
| `-v` | verbose |
| `-x` | don't cross filesystem boundaries (so `/proc`, `/sys`, etc. don't get copied) |
| `-H` | preserve hard links |
| `-A` | preserve ACLs |
| `-X` | preserve extended attributes |
| `--progress` | per-file progress (useful for the long copies) |

When it finishes, unmount:

```bash
sudo umount /mnt
```

> [!TIP]
> `screen` quick reference:
> - `screen -S <name>` — start a named session
> - `Ctrl+A`, then `D` — detach (the command keeps running)
> - `screen -ls` — list sessions
> - `screen -r <name>` — reattach
> 
> Essential when you're on an SSH session that might drop mid-copy.

***

## Step 4: Recreate the partition table

Now we get destructive. 

Open `fdisk` and rewrite the table:

```bash
sudo fdisk /dev/sda
```

> [!info]- Common command reference inside fdisk
> | Key | Action |
> |---|---|
> | `p` | print current partition table |
> | `d` | delete a partition |
> | `n` | new partition |
> | `t` | change partition type |
> | `w` | **write changes to disk** (point of no return) |
> | `q` | quit **without** writing |

> [!INFO]
> **Why deleting partitions inside `fdisk` doesn't destroy data:** `fdisk d` only removes the entry from the partition table: it doesn't touch the actual sectors holding the filesystem data. 
> 
> As long as you don't `mkfs` over those sectors afterwards, the data is still there, and `testdisk` can usually rebuild the entries from the surviving filesystem signatures. 
> 
> Only `mkfs`, `dd`, and the file-level operations after mounting actually overwrite content.

### Typical layout for a Linux server (BIOS boot)

| Partition | Size | Type | Purpose |
|---|---|---|---|
| `/dev/sda1` | 1 MB | `BIOS boot` (type `4`) | Reserved for GRUB stage-2 (Legacy BIOS only) |
| `/dev/sda2` | ~1 GB | Linux filesystem (type `83`) | `/boot` |
| `/dev/sda3` | remaining | Linux filesystem (type `83`) | `/` (root) |

### Typical layout for a Linux server (UEFI)

| Partition | Size | Type | Purpose |
|---|---|---|---|
| `/dev/sda1` | 500 MB | `EFI System` (type `1`) | EFI System Partition (ESP) — mounted at `/boot/efi` |
| `/dev/sda2` | ~1 GB | Linux filesystem (type `83`) | `/boot` |
| `/dev/sda3` | remaining | Linux filesystem (type `83`) | `/` (root) |

> [!TIP]
> If you have an **identical working machine** at hand (e.g. a sibling node in a cluster), copy its exact partition layout: start/end sectors, types, alignment. 
> 
> Eyeballing `fdisk` boundaries on a fresh table is error-prone, cloning a known-good layout removes that risk.

When the table looks right, press `w` to write. 

**There's no undo.**

***

## Step 5: Format the new partitions

```bash
# /boot (and / if you didn't preserve its contents)
sudo mkfs.ext4 /dev/sda2
sudo mkfs.ext4 /dev/sda3

# EFI System Partition, if applicable
sudo mkfs.vfat -F32 /dev/sda1
```

> [!IMPORTANT]
> **Don't reformat partitions whose data you want to keep.** 
> 
> If your root partition (`/dev/sda3`) wasn't actually damaged and you intend to restore the backup onto it, formatting wipes it. 
> 
> Only format the partitions whose data is gone or whose backup you're confident in.

***

## Step 6: Restore the data from your backup

Mount the new root, then mount `/boot` (and `/boot/efi` if UEFI) into the right place:

```bash
sudo mount /dev/sda3 /mnt              # / will be here
sudo mkdir -p /mnt/boot
sudo mount /dev/sda2 /mnt/boot         # /boot here

# UEFI only — mount the ESP
sudo mkdir -p /mnt/boot/efi
sudo mount /dev/sda1 /mnt/boot/efi
```

Rsync the backup back into `/mnt`. 

Use the same flags as Step 3, the metadata preservation matters even more during restore:

```bash
# From an external disk
sudo rsync -avxHAX --progress /mnt/external/sda-backup/ /mnt/

# Or from the remote backup host
sudo rsync -avxHAX --progress user@backup-host:/path/to/sda-backup/ /mnt/
```

Run this inside `screen` again: it's the same multi-hour copy as Step 3, in the other direction.

***

## Step 7: Bind-mount, chroot, and reinstall GRUB

At this point your data is back on the new partitions, but **the bootloader hasn't been installed onto the new partition table yet**. 

From here on, you follow the same procedure as [[grub-rescue#Scenario B: Reinstall GRUB from a Live USB|GRUB rescue, scenario B]], picking up from Step 5:
![[grub-rescue#Scenario B: Reinstall GRUB from a Live USB]]

***

## Step 8: Update `/etc/fstab` with the new UUIDs

**This is the most common cause of "I rebuilt everything and it still won't boot".** 

Recreating the partitions changes their UUIDs, but `/etc/fstab` still references the old ones. 

The system gets through GRUB, starts mounting partitions, fails on the UUID mismatch, and drops into emergency mode.

While still inside the chroot:

```bash
# Show the new UUIDs
blkid

# Show what /etc/fstab expects
cat /etc/fstab
```

Compare line by line. 

Update every UUID in `/etc/fstab` that doesn't match the current `blkid` output:

```bash
nano /etc/fstab
```

A typical fix looks like:

```diff
- UUID=old-uuid-here    /          ext4    defaults    0 1
+ UUID=new-uuid-here    /          ext4    defaults    0 1
- UUID=old-boot-uuid    /boot      ext4    defaults    0 2
+ UUID=new-boot-uuid    /boot      ext4    defaults    0 2
```

> [!TIP]
> A useful shortcut to spot mismatches at a glance:
> ```bash
> diff <(blkid -o export /dev/sda3 | grep ^UUID=) <(grep ' / ' /etc/fstab | awk '{print $1}')
> ```

***

## Step 9: Exit cleanly and reboot

```bash
exit                       # exit chroot
sudo umount -R /mnt        # release all the bind mounts at once
sudo reboot
```

Remove the rescue media, then watch the boot carefully. 

The first reboot after a filesystem rebuild is the moment of truth: if you see the GRUB menu, the kernel loading, and the login prompt, you're done.

If it fails at any stage, the most likely culprits, in order:

1. **UUID mismatch** in `/etc/fstab`: boot to the GRUB rescue console, edit `fstab` from initramfs, retry.
2. **Wrong partition type** on the BIOS boot / EFI partition: back to Live USB, fix with `fdisk t`.
3. **GRUB installed to the wrong device**: back to Live USB, redo `grub-install` against the correct disk.

***

## ⚠️ Last Resort: data is gone, no backup

If you reach this point with **no usable backup** and the data on the broken partitions is genuinely lost (Step 2 image wasn't taken, no external backup exists, `testdisk` failed), the honest answer is:

- **For valuable data**: stop, power off the disk, send it to a **professional data recovery service**. Any further write attempts make their job harder. Cost: typically €500-€5000 depending on damage type — only worth it for irreplaceable data.

- **For a recoverable system**: reinstall from scratch. 
  Recreate the partition table, install a fresh OS, restore *configuration* (not data) from your config management (Ansible, Terraform, manual notes, whatever you have). This is fast for a stateless node, painful for a stateful one that didn't have backups.

The real lesson is that **filesystem rebuild without a backup is the same as no rebuild at all**. 

The whole procedure in this guide assumes Step 2 succeeded: if it didn't, you're not rebuilding, you're installing fresh.
