---
title: "GRUB rescue: rebuild the bootloader from a Live USB"
tags:
  - Maintenance
---
## Overview

This guide covers how to **recover a broken GRUB installation**. the typical scenario where the system either:

- Drops you at a `grub rescue>` prompt at boot
- Shows "no bootable device found" / "no operating system" from the firmware
- Boot-loops without ever reaching the kernel

There are two approaches, depending on how broken GRUB is:

| Symptom at boot                                  | Method                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `grub rescue>` prompt is displayed               | [Scenario A](#scenario-a-manual-boot-from-grub-rescue): manual boot from the prompt (one-shot, then full repair from inside the OS) |
| No prompt: firmware can't find a bootable device | [Scenario B](#scenario-b-reinstall-grub-from-a-live-usb): reinstall GRUB from a Live USB                                            |

> [!NOTE]
> Both scenarios start by **booting from external media**: make sure your firmware boot order allows USB / external boot, or be ready to override it at POST. 
> 
> See [[hardware/enter-the-UEFI-BIOS|How to enter the UEFI / BIOS]] for the firmware setup.

***

## Scenario A: Manual boot from `grub rescue>`

If you only see `grub rescue>` at boot, GRUB's stage-1 is alive but it can't find its modules and `grub.cfg`. 

You can sometimes drive it manually to land in your OS:

> [!info]- The manual boot dance
> ```
> grub rescue> ls
> (hd0) (hd0,gpt1) (hd0,gpt2) (hd0,gpt3) ...
> 
> grub rescue> ls (hd0,gpt2)/
> # try each partition until you find a /grub/ or /boot/grub/ folder
> 
> grub rescue> set prefix=(hd0,gpt2)/boot/grub
> grub rescue> set root=(hd0,gpt2)
> grub rescue> insmod normal
> grub rescue> normal
> ```
> 
> If `normal` loads, the full GRUB menu reappears: boot the system as usual.

> [!IMPORTANT]
> This is a **one-shot rescue**. 
> 
> It gets you into the OS *for this boot*, but the underlying GRUB installation is still broken: you'll see `grub rescue>` again at the next reboot.
> 
 Once you're inside the OS, run **Steps 5-7 of Scenario B** to make the fix permanent (you don't need the Live USB for that, you're already inside the system).

***

## Scenario B: Reinstall GRUB from a Live USB

The canonical procedure: boot a Live USB of any modern Linux distro, chroot into your broken system, and reinstall GRUB from there.

### Step 1: Boot from a Live USB

Plug in the Live USB and select it at POST as the boot device. 

If the firmware doesn't pick it up automatically, see [[hardware/enter-the-UEFI-BIOS|How to enter the UEFI / BIOS]] to change the boot order.

> [!info]- Ubuntu Desktop Live
> Choose **"Try Ubuntu" / "Live session"** at the welcome screen (not "Install Ubuntu"). 
> 
> You'll land on a normal desktop with a terminal available.

> [!info]- Ubuntu Server Live
> On the "Choose the type of installation" screen, navigate to **Help → Enter shell** to get a root shell directly. 
> 
> No graphical environment, but everything you need is there.

> [!TIP]
> The Live USB version doesn't have to match the broken install. 
> 
> A Live USB of Ubuntu 24.04 can chroot into a Debian 11 install and reinstall its GRUB just fine, what matters is having the `grub-install` binary, which every desktop / server distro ships.

### Step 2: Identify your partitions

```bash
sudo lsblk -f
```

Identify:

- The **root partition**: typically the biggest, formatted as `ext4` / `btrfs` / `xfs`. On LVM setups it appears as `vg-root` (or similar) under `/dev/mapper/`.
- The **EFI System Partition (ESP)**: only on UEFI systems. Small (~500 MB), `vfat`, type `EFI`.
- A separate **`/boot` partition**, if any. Small, `ext4` or `ext2`.

For UUIDs and filesystem types, use `blkid`:

```bash
sudo blkid
```

### Step 3: Mount the root partition

```bash
sudo mount /dev/sdaN /mnt
```

Replace `/dev/sdaN` with your actual root partition (e.g. `/dev/sda5`, `/dev/nvme0n1p2`, or `/dev/mapper/vg-root` for LVM).

### Step 4: Mount `/boot` and `/boot/efi`, if separate

Check what your broken install expects:

```bash
cat /mnt/etc/fstab
```

If `/boot` is on a separate partition, mount it inside the chroot tree:

```bash
sudo mount /dev/sdaM /mnt/boot
```

If it's a UEFI system, also mount the EFI System Partition:

```bash
sudo mount /dev/sdaK /mnt/boot/efi
```

### Step 5: Bind-mount the kernel pseudo-filesystems

GRUB needs access to a "live" device tree, kernel, and process info when it runs. 

Bind-mount them from the Live environment into the chroot:

```bash
for d in /sys /proc /run /dev; do
  sudo mount --rbind "$d" "/mnt$d"
done
```

> [!INFO]
> The `--rbind` (recursive bind) flag is important: without it, sub-mounts like `/sys/fs/cgroup` and `/dev/pts` aren't visible inside the chroot and some tools (`apt`, `dpkg`, `update-initramfs`) will fail with cryptic errors.

### Step 6: Chroot into your broken install

```bash
sudo chroot /mnt
```

You're now root **inside your actual system**, using its own libraries and binaries, not the Live environment's. 

From this point on, run commands as if you were locally logged in as root.

### Step 7: Reinstall GRUB

> [!info]- For Legacy BIOS systems
> ```bash
> grub-install /dev/sda
> update-grub
> ```
> Note: the target is the **whole disk** (`/dev/sda`), **not a partition** (`/dev/sda1`). GRUB's stage-1 lives in the MBR of the disk, not inside any filesystem.

> [!info]- For UEFI systems
> ```bash
> grub-install --target=x86_64-efi \
>   --efi-directory=/boot/efi \
>   --bootloader-id=ubuntu \
>   --recheck
> update-grub
> ```
> 
> Replace `ubuntu` in `--bootloader-id` with your distro's identifier (`debian`, `fedora`, `arch`...): this becomes the entry name in the UEFI boot menu.

### Step 8: Exit cleanly and reboot

```bash
exit                    # exit the chroot
sudo umount -R /mnt     # release ALL the bind mounts at once
sudo reboot
```

Remove the Live USB while the system reboots. 

GRUB should now appear (or boot straight to the kernel, depending on your `GRUB_TIMEOUT`: see [[hardware/enter-the-GRUB|How to enter the GRUB boot menu]] if you want to change that).

> [!WARNING]
> Skipping `umount -R /mnt` is a common pitfall: without it, `reboot` waits for each bind mount to release (one per `--rbind` you made in Step 5) and adds a ~90-second timeout to the reboot. 
> 
> Annoying, not fatal.

***

## Optional: also reinstall kernel and initramfs

If reinstalling GRUB alone didn't fix the boot (e.g. you still see *"kernel not found"* or `/boot/vmlinuz-*` / `initrd.img-*` are missing), reinstall the kernel package from within the chroot (after Step 6, before exiting):

```bash
# Rebuild the initramfs for every installed kernel
update-initramfs -c -k all

# Reinstall the default kernel meta-package
apt-get install --reinstall linux-generic

# (Optional) reinstall a specific kernel version, if you know which one is broken
dpkg -l | grep linux-image
apt-get install --reinstall linux-image-<version>-generic \
                            linux-headers-<version>-generic

# Regenerate GRUB config so it picks up the rebuilt kernel
update-grub
```

***

## Common pitfalls

> [!WARNING]
> **UUID mismatch in `/etc/fstab` after partition changes.** If you recreated any partition (not just GRUB), its UUID has changed. The system will boot GRUB but then fail to mount `/`, `/boot`, or `/boot/efi`. Compare:
> ```bash
> blkid                   # current UUIDs
> cat /etc/fstab          # UUIDs the system expects
> ```
> Update `/etc/fstab` if they diverge.

> [!Important]
> **EFI boot entry persistence.** Some UEFI firmwares (typical on Dell / HP enterprise hardware) wipe their boot menu entries when the target file is missing. After `grub-install` on UEFI, verify the entry was created:
> ```bash
> efibootmgr -v | grep -i ubuntu
> ```
> If empty, add it manually:
> ```bash
> efibootmgr --create \
>   --disk /dev/sda --part 1 \
>   --label "ubuntu" \
>   --loader '\EFI\ubuntu\shimx64.efi'
> ```

> [!Important]
> **`dpkg --configure -a` while you're inside the chroot.** 
> 
> If the system broke during a half-applied package upgrade (very common cause of "GRUB still works but boot is broken"), run this inside the chroot before `grub-install`:
> ```bash
> dpkg --configure -a
> ```
> When the pink "config file modified" dialog appears, choose **"Keep the local version"** unless you specifically know you want the upstream version.

***

## ⚠️ Last Resort: rebuild the partitions

If the partition table itself is corrupted, not just GRUB (e.g. a `/boot` partition was accidentally deleted, or the disk layout is unrecognizable) GRUB rescue alone won't help. 

You're in [[filesystem-rebuild|filesystem rebuild]] territory: recreate partitions with `fdisk` / `parted`, format them, rsync the data back from a backup, then run the GRUB rescue above.

That's a separate procedure with its own dedicated page. 

For now, if you reach this point, **the safest immediate moves are**:

1. **Don't write anything else to the disk** until you've imaged it (`dd if=/dev/sda of=/path/to/backup.img bs=4M status=progress`): once you rewrite the partition table, recovery becomes much harder.
2. Boot the Live USB in **try mode**, not install mode.
3. Try `testdisk` (interactive partition recovery tool) before any manual `fdisk` rewriting: it can often rebuild a destroyed partition table from on-disk signatures alone.
4. Only after you have a working image backup, proceed with the manual rebuild + GRUB rescue.