---
title: How to enter the GRUB boot menu
tags:
  - Maintenance
---
## Overview

This guide explains how to access the **GRUB** (GRand Unified Bootloader) menu on a Linux system, where you can choose between kernels, edit boot parameters, drop into rescue mode, or chain-load other operating systems.

> [!NOTE]
> **When GRUB shows up by default:** in **dual-boot** setups and on most **server** installs, GRUB appears at every boot with a few-second timeout. On **single-OS desktop** installs (Ubuntu, Fedora…) it's typically hidden behind a zero-second timeout, so you have to force it to appear.

***

## Check if GRUB is your bootloader

Before trying any method, confirm GRUB is what your system actually uses (some modern minimal installs use **systemd-boot** or **rEFInd** instead).

> [!info]- From a running Linux
> Check for GRUB's installation directory:
> 
> ```bash
> ls /boot/grub/ 2>/dev/null || ls /boot/grub2/ 2>/dev/null
> ```
> 
> | Result | Bootloader |
> | -------------------------------- | ------------------ |
> | `grub.cfg`, `fonts/`, `themes/`  | ✅ GRUB             |
> | Both fail | ❌ Probably systemd-boot or rEFInd |
> 
> You can also verify with:
> 
> ```bash
> sudo bootctl status
> ```
> 
> If `bootctl` reports `systemd-boot`, this guide doesn't apply to you.

***

## Enter the GRUB
### 1. Interrupt the boot (the classic way)

The historic and most universal method: catch GRUB's tiny timeout window with the right key press, right after the firmware POST.

> [!info]- Hold Shift or tap Esc
> 1. Reboot the system normally.
> 2. The moment the firmware screen (BIOS/UEFI vendor logo) disappears, start pressing:
> 
> | Boot mode               | Key                |
> | ----------------------- | ------------------ |
> | **Legacy BIOS**         | Hold `Shift`       |
> | **UEFI (modern GRUB)**  | Tap `Esc` repeatedly |
> | **Some OEMs (rare)**    | `F4`               |
> 
> 3. The GRUB menu appears with the list of kernels.
> 
> Timing matters: start *after* POST, otherwise the firmware itself grabs the key.

> [!info]- If you can't catch the timing
> The window can be a few hundred milliseconds: UEFI Fast Boot is the enemy here. 
> Disable **Fast Boot** in the firmware settings (see [[hardware/enter-the-UEFI-BIOS|How to enter the UEFI / BIOS]]).
> This is a workaround: the real fix is Method 3 below.

***

### 2. From a running Linux (systemd ≥ 240)

If you're already inside Linux and want the *next* reboot to land in GRUB automatically:

> [!info]- One-shot systemctl flag
> ```bash
> sudo systemctl reboot --boot-loader-menu=3
> ```
> 
> Tells systemd to ask the bootloader to display the menu for **3 seconds** on the next boot, then forget the override.
> 
> Requires: systemd ≥ 240 + GRUB ≥ 2.04 with `GRUB_RECORDFAIL_TIMEOUT` support. 

***

### 3. Make GRUB appear every time

If you find yourself needing GRUB often (kernel debugging, rescue work, frequent dual-boot switching), unhide the menu permanently.

> [!info]- Edit /etc/default/grub
> ```bash
> sudo nano /etc/default/grub
> ```
> 
> Set:
> ```
> GRUB_TIMEOUT_STYLE=menu
> GRUB_TIMEOUT=5
> ```
> 
> Then regenerate the config:
> ```bash
> sudo update-grub          # Debian / Ubuntu
> sudo grub2-mkconfig -o /boot/grub2/grub.cfg   # RHEL / Fedora
> ```
> 
> GRUB will now show the menu for 5 seconds at every boot. Use `GRUB_TIMEOUT=-1` to wait indefinitely (good for headless servers where you want a human to confirm before booting).

***

## ⚠️ Last Resort: live USB rescue

If GRUB is corrupted (no menu, no shell, kernel panic, or "no bootable device") and none of the above gets you in:

- Boot from a **live USB** of your distribution.
- Mount your root partition: `sudo mount /dev/sdaX /mnt`
- (If `/boot` is separate) mount it too: `sudo mount /dev/sdaY /mnt/boot`
- Bind-mount the system dirs and chroot:

```bash
for d in dev proc sys run; do sudo mount --bind /$d /mnt/$d; done
sudo chroot /mnt
```

- Reinstall GRUB and regenerate the config:
```bash
grub-install /dev/sda
update-grub
```

This rewrites the GRUB stage-1 in the boot sector / EFI partition and regenerates `grub.cfg` from scratch.