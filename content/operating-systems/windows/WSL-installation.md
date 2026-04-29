---
title: Use Linux shell in Windows! - WSL Installation (Windows Subsystem for Linux)
---
## 🔎 Overview

This guide walks you through the complete setup of Windows Subsystem for Linux (WSL) on Windows.
It covers the installation of WSL2, the setup of a Linux distribution, and the essential commands to get started.

WSL2 is a lightweight, Hyper-V–based virtualized Linux environment, tightly integrated with Windows.
You get the benefits of using popular Linux distributions (Ubuntu, Debian, Kali...) and their tools
while staying within your Windows environment. This allows you to have a separate environment for
testing, run scripts, create automations and much more!

---

## 1️⃣ Prerequisites

**Requirements:**
- Windows 10+
- Virtualization (Intel VT-x / AMD-V) enabled in your BIOS

Check if virtualization is enabled:

```powershell
systeminfo | find "Virtualization"
```

If disabled, you need to enable it in your BIOS/UEFI.
First, check out [how to enter the BIOS](enter-the-BIOS).

---

## 2️⃣ Install WSL

Open PowerShell as Administrator:

```powershell
wsl --install
```

This command enables the required Windows features, installs WSL2, and automatically installs Ubuntu.
Restart Windows when prompted. After reboot, Ubuntu will start automatically and you will be prompted
to create a username and password.

---

## 3️⃣ Verify the Installation

Check that you are running WSL Version 2:

```powershell
wsl --list --verbose
```

If you are not on WSL2, upgrade with:

```powershell
wsl --set-version Ubuntu 2
```

---

## 4️⃣ Install Other Distros

If you don't want to use Ubuntu, or you want multiple options available, you can install additional distros.

List what's available:

```powershell
wsl --list --online
```

Then install the one you want:

```powershell
wsl --install -d <DISTRO_NAME>
```

---

## 5️⃣ Basic Commands

Enter WSL (default distro):

```powershell
wsl
```

Or enter a specific distro:

```powershell
wsl -d Ubuntu
```

---

## 6️⃣ File System

| Location | Path |
|---|---|
| WSL filesystem (from Windows) | `\\wsl$\Ubuntu\` |
| Windows filesystem (from WSL) | `/mnt/c/` |

---

## 7️⃣ Basic Configuration

System update:

```bash
sudo apt update && sudo apt upgrade -y
```

Useful tools:

```bash
sudo apt install -y curl wget git vim net-tools htop
```

---

## 8️⃣ Common Issues

### Virtualization error

Check your BIOS settings, or run:

```powershell
bcdedit /set hypervisorlaunchtype auto
```