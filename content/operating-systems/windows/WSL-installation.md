---
title: Use Linux shell in Windows! - WSL Installation (Windows Subsystem for Linux)
---
## 🔎 Overview

This guide walks you through the complete setup of Windows Subsystem for Linux (WSL) on Windows. It covers the installation of WSL2, the setup of a Linux distribution, and the essential commands to get started.

WSL2 is a lightweight, Hyper-V–based virtualized Linux environment, tightly integrated with Windows.

You get the benefits of using popular Linux distributions (Ubuntu, Debian, Kali...) and their tools while staying within your Windows environment. This allows you to have a separate environment for testing, run scripts, create automations and much more!

Let's see how to get it!

------------------------------------------------------------------------

  

## 0️⃣ Prerequisites

  

Requirements:

- Windows 10+ (works in every version!)

- Virtualization (Intel VT-x / AMD-V) enabled in your BIOS

  
### Check if virtualization is enabled:

  

```powershell

systeminfo | find "Virtualization"

```

  

If disabled → we have to enable it in our BIOS/UEFI.

First thing, check out [how to enter the BIOS](obsidian://open?vault=Obsidian%20Vault&file=hardware%2Fenter-the-BIOS).

  

------------------------------------------------------------------------

  

## 2️⃣ Install WSL

  

Open **PowerShell as Administrator**:

  

```powershell

wsl --install

```

This command enables the required Windows features, installs WSL2, and automatically installs Ubuntu for us.

Restart Windows when prompted.

After reboot, Ubuntu will start automatically and you will be prompted to create a username and password.

------------------------------------------------------------------------

  

## 4️⃣ Verify the installation

  
First thing after the installation, we want to check that we are on Version 2 (so WSL2):
```powershell

wsl --list --verbose

```

If we are not in WSL2:

```powershell

wsl --set-version Ubuntu 2

```


------------------------------------------------------------------------

  

## 5️⃣ Install other distros

  
After the installation, if you don't want to use Ubuntu or you want to have multiple options available, you can install new distros. 

First you list what's available:

```powershell

wsl --list --online

```

Then you install it with:


```powershell

wsl --install -d <DISTRO_NAME>

```


------------------------------------------------------------------------

  

## 6️⃣ Basic commands

  

Enter WSL:

  

```powershell

wsl

```

  

Or a specific distro:


```powershell

wsl -d Ubuntu

```

  

  

------------------------------------------------------------------------

  

## 7️⃣ File System

  

**WSL FileSystem (accessible from Windows as a Network Path):** \\wsl$\Ubuntu\

**Windows FileSystem (accessible inside WSL):** /mnt/c/

  

------------------------------------------------------------------------

  

## 8️⃣ Basic configuration

  

### System update

  

```bash

sudo apt update && sudo apt upgrade -y

```

  

### Useful tools

  

```bash

sudo apt install -y curl wget git vim net-tools htop

```


  

------------------------------------------------------------------------

  

## 10️⃣ Common issues

  
### Virtualization error

  

Check BIOS or:

  

```powershell

bcdedit /set hypervisorlaunchtype auto

```

  

------------------------------------------------------------------------