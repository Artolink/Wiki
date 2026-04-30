---
title: Use Linux shell in Windows! - WSL Installation (Windows Subsystem for Linux)
---
# 🔎 Overview

This guide walks you through the complete setup of Windows Subsystem for Linux (WSL) on Windows. It covers the installation of WSL2, the setup of a Linux distribution, and the essential commands to get started.

WSL2 is a lightweight, Hyper-V–based virtualized Linux environment, tightly integrated with Windows. You get the benefits of using popular Linux distributions (Ubuntu, Debian, Kali...) and their tools while staying within your Windows environment.

This allows you to have a separate environment for testing, run scripts, create automations and much more!

---

## 0️⃣ Prerequisites

**Requirements:**
- Windows 10+
- Virtualization (Intel VT-x / AMD-V) enabled in your UEFI/BIOS

Check if virtualization is enabled:

```powershell
systeminfo | find "Virtualization"
```

> ⚠️ If it's disabled, you need to enable it in your UEFI/BIOS!
> If you don't know how to get there, check out [how to enter the UEFI / BIOS](enter-the-UEFI-BIOS.md).

---

## 1️⃣ WSL Installation

Open PowerShell as Administrator:

```powershell
wsl --install
```

This command enables the required Windows features, installs WSL2, and automatically installs Ubuntu.

A reboot is required for the changes to take effect. After reboot, Ubuntu will start automatically and you will be prompted to create a username and password for your new OS.

---

## 2️⃣ Verify the Installation

Check that you are running WSL Version 2:

```powershell
wsl --version
```

If you are not on WSL2, upgrade with:

```powershell
wsl --set-version Ubuntu 2
```

---

## 3️⃣ Install Other Distros

If you don't want to use Ubuntu, or you want to use multiple OS, you can install additional distros.

List what's available:

```powershell
wsl --list --online
```

Then install the one you want:

```powershell
wsl --install -d <DISTRO_NAME>
```

---

## 4️⃣ Accessing the File Systems

WSL allows access to both Windows and Linux file systems. Here's how you can access them:

| Location | Path | Description |
|---|---|---|
| WSL filesystem (from Windows) | `\\wsl$\<DISTRO_NAME>\` | The WSL FS is exposed as a virtual network share |
| Windows filesystem (from WSL) | `/mnt/c/` | Automatic mount of Windows drives inside WSL |

> ⚠️ **Best practice:**
> Avoid working directly under `/mnt/c` for I/O-intensive workloads (e.g. managing a Git repo), as performance is slower! Use `/mnt/c` mainly for Windows file access and exchange and prefer storing code and projects inside the WSL filesystem for optimal performance.

---

## 5️⃣ Basic Commands

Enter WSL (default distro):

```powershell
wsl
```

You can add `-d <DISTRO_NAME>` to enter a specific distro you installed.

Update WSL:

```powershell
wsl --update
```

Check WSL status:

```powershell
wsl --status
```

---

## 6️⃣ Basic Configuration

System update:

```bash
sudo apt update && sudo apt upgrade -y
```

Useful tools:

```bash
sudo apt install -y curl wget git vim net-tools htop
```

---

## 7️⃣ Advanced: Backup & Restore

### Backup

> ⚠️ The WSL environment must be fully stopped before exporting.

**Template:**

```powershell
wsl --shutdown
$DATE = Get-Date -Format "yyyy-MM-dd_HH-mm"
wsl --export <DISTRO_NAME> <BACKUP_PATH>\<DISTRO_NAME>-$DATE.vhdx --vhd
```

**Example:**

```powershell
wsl --shutdown
$DATE = Get-Date -Format "yyyy-MM-dd_HH-mm"
wsl --export Ubuntu C:\backups\Ubuntu-$DATE.vhdx --vhd
```

### Restore

**Template:**

```powershell
wsl --import <NEW_DISTRO_NAME> <INSTALL_LOCATION> <VHDX_FILE_PATH> --vhd
```

**Example:**

```powershell
wsl --import Ubu2 C:\WSL\Ubu2 C:\backups\Ubuntu-2026-04-30_14-00.vhdx --vhd
```

---

## 8️⃣ Useful Links

- [WSL Official Documentation](https://learn.microsoft.com/en-us/windows/wsl/) — Microsoft Learn
- [Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install) — Step-by-step official install guide
- [Troubleshooting WSL](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting) — Microsoft Learn official troubleshooting page
- [WSL Troubleshooting Guide](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting-guide) — Extended guide by Microsoft
- [Basic WSL Commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) — Full command reference