---
title: Use Linux shell in Windows! - WSL Installation (Windows Subsystem for Linux)
tags:
  - StartingTools
---
# Overview

This guide walks you through the complete setup of Windows Subsystem for Linux (WSL) on Windows. It covers the installation of WSL2, the setup of a Linux distribution, and the essential commands to get started.

WSL2 is a lightweight, Hyper-V–based virtualized Linux environment, tightly integrated with Windows. You get the benefits of using popular Linux distributions (Ubuntu, Debian, Kali...) and their tools while staying within your Windows environment.

This allows you to have a separate environment for testing, run scripts, create automations and much more!

---

## 0️. Prerequisites

**Requirements:**
- Windows 10+
- Virtualization (Intel VT-x / AMD-V) enabled in your system's firmware settings (UEFI or the legacy BIOS)

Check if virtualization is enabled:

```powershell
systeminfo | find "Virtualization"
```

If it's disabled, we have to enable it by editing the firmware!

If you don't know how to get there, check out [how to enter the UEFI-BIOS](enter-the-UEFI-BIOS.md).

> [!NOTE]
> Virtualization support is determined exclusively by the CPU. It is independent of whether the system firmware is legacy BIOS or UEFI.


### Enable Firmware CPU virtualization

Now that you are inside your system's UEFI/BIOS, you have to find the option for enabling CPU virtualization.

Here's a list of the main manufacturers and how to enable it:

| PC Manufacturer | Link                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acer            | [How to Enable Virtualization Technology on Acer Products](https://community.acer.com/kb/articles/14750)                                                                                                                                                                                                                                                                                  |
| Asus            | For AMD processors: [How to enable or disable AMD Virtualization (AMD-V™) technology?](https://www.asus.com/support/FAQ/1043992)<br>For Intel processors:<br>[How to enable Intel(VMX) Virtualization Technology in the BIOS?](https://www.asus.com/support/FAQ/1043786)<br>[How to enable or disable Intel® Virtualization Technology (VT-x)?](https://www.asus.com/support/FAQ/1043181) |
| Dell            | [How To Enable or Disable Hardware Virtualization on Dell Systems](https://www.dell.com/support/kbdoc/000195978/)                                                                                                                                                                                                                                                                         |
| HP              | [HP PCs - Enable Virtualization Technology in the BIOS](https://support.hp.com/us-en/document/ish_5637142-5637191-16)                                                                                                                                                                                                                                                                     |
| Lenovo          | [How to enable Virtualization Technology on Lenovo PC computers](https://support.lenovo.com/solutions/ht500006)                                                                                                                                                                                                                                                                           |
| Microsoft       | Virtualization is already enabled on Surface devices.                                                                                                                                                                                                                                                                                                                                     |

---

## 1️. WSL Installation

Open PowerShell as Administrator:

```powershell
wsl --install
```

This command enables the required Windows features, installs WSL2, and automatically installs Ubuntu.

A reboot is required for the changes to take effect. After reboot, Ubuntu will start automatically and you will be prompted to create a username and password for your new OS.

---

## 2️. Verify the Installation

Check that you are running WSL Version 2:

```powershell
wsl --version
```

If you are not on WSL2, upgrade with:

```powershell
wsl --set-version Ubuntu 2
```

And... that's it!

---

## 3️. Accessing the File Systems

WSL allows access to both Windows and Linux file systems. Here's how you can access them:

| Location | Path | Description |
|---|---|---|
| WSL filesystem (from Windows) | `\\wsl$\<DISTRO_NAME>\` | The WSL FS is exposed as a virtual network share |
| Windows filesystem (from WSL) | `/mnt/c/` | Automatic mount of Windows drives inside WSL |
>[!TIP]
> **Best practice:**
> Avoid working directly under `/mnt/c` for I/O-intensive workloads (e.g. managing a Git repo), as performance is slower! Use `/mnt/c` mainly for Windows file access and exchange and prefer storing code and projects inside the WSL filesystem for optimal performance.

---

## 4️. Basic Commands

| Command | Description |
|---|---|
| `wsl` | Enter WSL (default distro). Add `-d <DISTRO_NAME>` to enter a specific one |
| `wsl --update` | Update WSL |
| `wsl --status` | Check WSL status |
| `wsl --shutdown` | Stop all running WSL instances |
| `wsl -l -v` | List all installed distros with their WSL version and state |
| `wsl --list --online` | List all available distros to install |
| `wsl --install -d <DISTRO_NAME>` | Install a specific distro |
| `wsl --set-default <DISTRO_NAME>` | Set the default distro |

---

## 5️. Interoperability

WSL allows you to call Windows executables directly from the Linux shell. Any `.exe` in the Windows PATH is accessible from WSL.

| Command | Description |
|---|---|
| `code .` | Open the current directory in VS Code (via WSL Remote Extension) |
| `explorer.exe .` | Open the current directory in Windows File Explorer |
| `notepad.exe <file>` | Open a file with Notepad |
| `explorer.exe <file>` | Open a file with its default Windows application |

---

## 6️. Basic Configuration

System update:

```bash
sudo apt update && sudo apt upgrade -y
```

Useful tools:

```bash
sudo apt install -y curl wget git vim net-tools htop
```

---

## 7️. Advanced: Backup & Restore

### Backup

> [!WARNING]
> The WSL environment must be fully stopped before exporting.

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