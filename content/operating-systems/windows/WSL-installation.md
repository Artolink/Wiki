---
title: Use Linux shell in Windows! - WSL Installation (Windows Subsystem for Linux)
---
## 🔎 Overview

This guide walks you through the complete setup of Windows Subsystem for Linux (WSL) on Windows.
It covers the installation of WSL2, the setup of a Linux distribution, and the essential commands
to get started.

WSL2 is a lightweight, Hyper-V–based virtualized Linux environment, tightly integrated with Windows.
You get the benefits of using popular Linux distributions (Ubuntu, Debian, Kali...) and their tools
while staying within your Windows environment. This allows you to have a separate environment for
testing, run scripts, create automations and much more!

***

## 0️⃣ Prerequisites

**Requirements:**
- Windows 10+
- Virtualization (Intel VT-x / AMD-V) enabled in your BIOS

Check if virtualization is enabled:

```powershell
systeminfo | find "Virtualization"
```

If disabled, you need to enable it in your BIOS/UEFI.
First, check out [how to enter the BIOS](enter-the-BIOS).

***

## 1️⃣ Install WSL

Open PowerShell as Administrator:

```powershell
wsl --install
```

This command enables the required Windows features, installs WSL2, and automatically installs Ubuntu.
Restart Windows when prompted. After reboot, Ubuntu will start automatically and you will be prompted
to create a username and password.

***

## 2️⃣ Verify the Installation

Check that you are running WSL Version 2:

```powershell
wsl --list --verbose
```

If you are not on WSL2, upgrade with:

```powershell
wsl --set-version Ubuntu 2
```

***

## 3️⃣ Install Other Distros

If you don't want to use Ubuntu, or you want multiple options available, you can install additional
distros.

List what's available:

```powershell
wsl --list --online
```

Then install the one you want:

```powershell
wsl --install -d <DISTRO_NAME>
```

***

## 4️⃣ Basic Commands

Enter WSL (default distro):

```powershell
wsl
```

Or enter a specific distro:

```powershell
wsl -d Ubuntu
```

***

## 5️⃣ File System

| Location                        | Path               |
|---------------------------------|--------------------|
| WSL filesystem (from Windows)   | `\\wsl$\Ubuntu\`   |
| Windows filesystem (from WSL)   | `/mnt/c/`          |

***

## 6️⃣ Basic Configuration

System update:

```bash
sudo apt update && sudo apt upgrade -y
```

Useful tools:

```bash
sudo apt install -y curl wget git vim net-tools htop
```

***

## 7️⃣ Common Issues

### Virtualization not enabled

Enable Hyper-V and Virtual Machine Platform via PowerShell, then reboot:

```powershell
bcdedit /set hypervisorlaunchtype auto
```

***

### Kernel update required

**Error:** `WSL 2 requires an update to its kernel component`

The Linux kernel package is missing or outdated. Update it with:

```powershell
wsl --update
```

Then set WSL2 as the default version:

```powershell
wsl --set-default-version 2
```

***

### WslRegisterDistribution failed

**Error:** `WslRegisterDistribution failed with error: 0x800700c1` (common after Windows Updates)

The `LxssManager` service may not be running. Set it to start automatically:

```powershell
Get-Service LxssManager | Set-Service -StartupType Automatic
Start-Service LxssManager
```

If the issue persists, try repairing WSL from **Settings → Installed Apps → Windows Subsystem
for Linux → Advanced Options → Repair**.

***

### No internet access inside WSL

DNS resolution may be broken. Override it manually:

```bash
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

To make it persistent, disable automatic DNS generation in `/etc/wsl.conf`:

```ini
[network]
generateResolvConf = false
```

***

### WSL broken after Windows Update

A Windows update can break WSL. First, try repairing or resetting from
**Settings → Installed Apps → Windows Subsystem for Linux → Advanced Options**.

If that doesn't help, reinstall WSL cleanly:

```powershell
wsl --unregister Ubuntu
wsl --install -d Ubuntu
```

***

### Filesystem corruption (dirty shutdown)

If WSL fails to start after an unexpected shutdown or power loss, the virtual disk may be corrupt.
Check and repair the ext4 image:

```powershell
wsl --shutdown
wsl --mount --vhd "$env:LOCALAPPDATA\Packages\...\ext4.vhdx" --bare
```

Then run `fsck` on the mounted partition from a live Linux environment or WSL recovery.

***

## 8️⃣ Useful Links

### Official Documentation

- [WSL Official Documentation](https://learn.microsoft.com/en-us/windows/wsl/) — Microsoft Learn
- [Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install) — Step-by-step official install guide
- [Basic WSL Commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) — Full command reference

### Common Issues Sources

- [Troubleshooting WSL](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting) — Microsoft Learn official troubleshooting page
- [WSL Troubleshooting Guide](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting-guide) — Extended guide by Microsoft
- [WSL Error Messages and Codes](https://www.thewindowsclub.com/troubleshoot-windows-subsystem-for-linux-error-messages-and-codes) — TheWindowsClub: common error codes and fixes
- [WSL GitHub Issues](https://github.com/microsoft/wsl/issues) — Official issue tracker, useful for edge cases and bug reports