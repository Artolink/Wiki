---
title: Reset the root password via GRUB
tags:
---
## Overview

This guide shows how to **reset a forgotten `root` password** (or any user's password) on a Linux machine by booting it into a single-user shell through GRUB, bypassing the normal login flow.

This works because the kernel command line is editable from the GRUB menu: by appending `init=/bin/bash`, the kernel skips systemd and drops you straight into a root shell on a read-only root filesystem.

> [!WARNING]
> This is effectively **physical-access exploitation of GRUB**: anyone with console access to an unprotected GRUB can do this. 
> 
> This procedure does **not** work if:
> - The root filesystem is **LUKS-encrypted** (the kernel can't boot without the passphrase).
> - GRUB itself is **password-protected**.
> 
> In both cases you must fall back to the live-USB method.
> See the **Hardening** section at the bottom.

***

## Reset root password
### 1. Enter the GRUB menu

The whole procedure starts from the GRUB menu, so you need to be able to display it.

See [[hardware/enter-the-GRUB|How to enter the GRUB boot menu]] for the available methods.

You should see the list of kernel entries (typically "Ubuntu", "Advanced options for Ubuntu"...).

***

### 2. Edit the kernel command line

> [!info]- Standard procedure (Debian / Ubuntu / Arch / generic)
> 1. Highlight the **default kernel entry** (the first one, usually).
> 2. Press `e` to edit it.
> 3. Use the arrow keys to scroll to the line starting with `linux` (or `linux16` on older systems): that's the kernel command line.
> 4. Move the cursor to the **end** of that line.
> 5. Append a space and then:
>    ```
>    init=/bin/bash
>    ```
> 6. Press `Ctrl+X` (or `F10`) to boot with the modified command line.
> 
> The kernel will skip systemd entirely and start `bash` as PID 1: no login prompt, no PAM, no services.

> [!info]- Red Hat / Fedora / CentOS / RHEL 8+
> The Red Hat family uses a slightly different mechanism. Instead of `init=/bin/bash`, append:
> 
> ```
> rd.break
> ```
> 
> This drops you into the **initramfs emergency shell** *before* the real root is mounted (the chroot dance in Step 3 is different).

***

### 3. Remount the root filesystem as read-write

By default the root is mounted **read-only** in this minimal boot, so `passwd` would fail when trying to write `/etc/shadow`.

> [!info]- Standard procedure (init=/bin/bash)
> ```bash
> mount -o remount,rw /
> ```
> 
> Verify it took:
> ```bash
> mount | grep ' / '
> # Should now show: (rw, …)
> ```

> [!info]- Red Hat path (rd.break)
> The real root sits at `/sysroot` in the emergency shell:
> ```bash
> mount -o remount,rw /sysroot
> chroot /sysroot
> ```
> You're now in a shell inside the actual root filesystem.

***

### 4. Reset the password

```bash
passwd root
```

Type the new password twice. 

`passwd` writes the new hash directly to `/etc/shadow`.

***

### 5. Sync, relabel, and reboot

This step is critical. 

Skipping it leaves the password change in cache without ever hitting disk, and on SELinux distros it leaves `/etc/shadow` with the wrong context (login will keep failing).

```bash
sync # Forces the changes to disk
```

And on SELinux distros (RHEL / Fedora / CentOS), schedule a relabel
```bash
touch /.autorelabel
```

Then you can reboot, and login with the new password you just set.

***

### ⚠️ Last Resort: live USB chroot

If GRUB is password-protected, or for any reason you can't reach the menu, fall back to a live USB:

1. Boot from a live USB of any Linux distro (the version doesn't have to match).
2. Decrypt the root partition first if it's LUKS (you still need that passphrase, no shortcut around it).
3. Mount the root partition and chroot:
   ```bash
   sudo mount /dev/sdaX /mnt
   for d in dev proc sys run; do sudo mount --bind /$d /mnt/$d; done
   sudo chroot /mnt
   ```
4. Reset the password as in Step 4 (`passwd root`) and exit + reboot.

***

## Hardening: prevent this attack

Since the procedure above works on any unprotected GRUB, the only real defenses are at the boot layer.

> [!info]- Set a GRUB password
> Generate a PBKDF2 hash:
> ```bash
> grub-mkpasswd-pbkdf2
> ```
> 
> Copy the resulting `grub.pbkdf2.sha512.…` string. 
> 
> Then edit `/etc/grub.d/40_custom`:
> 
> ```
> set superusers="admin"
> password_pbkdf2 admin grub.pbkdf2.sha512.<paste-the-rest-here>
> ```
> 
> Regenerate the config:
> ```bash
> sudo update-grub
> ```
> 
> From now on, editing any GRUB entry (pressing `e`) requires the `admin` password.

> [!info]- Full disk encryption (LUKS)
> The only thing that *really* defeats this attack, **including** the live-USB fallback, is full-disk encryption on the root partition.
> 
> - The kernel won't boot without the LUKS passphrase.
> - Live-USB chroot can't mount `/` without the passphrase either.
>   
> Cost: you have to enter the passphrase at every reboot.

> [!important]
> A GRUB password alone is **not** a strong defense: anyone with physical access can yank the disk, plug it into another machine, and mount it directly. 
> 
> Combine it with LUKS for actual security.