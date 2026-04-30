---
title: How to enter the UEFI / BIOS
---
# 🖥️ How to Enter the UEFI / BIOS

This guide explains how to access your system's firmware settings (UEFI or legacy BIOS) in order to change hardware-level options such as enabling CPU virtualization.

> ℹ️ **UEFI vs Legacy BIOS:** UEFI is the modern firmware standard and allows direct access from within Windows. Legacy BIOS is older firmware with no OS-level entry point — the only way in is through keyboard input at boot time (POST).

***

## 0️⃣ Check if Your System is UEFI or Legacy BIOS

Before trying any method, confirm your firmware type.

### Windows

Open PowerShell and run:

```powershell
bcdedit /enum
```

Look for the `path` field:

| Output | Firmware type |
|---|---|
| `\Windows\system32\winload.efi` | ✅ UEFI |
| `\Windows\system32\winload.exe` | ❌ Legacy BIOS |

### Linux

The kernel exposes firmware info directly via the filesystem. Run:

```bash
[ -d /sys/firmware/efi ] && echo "UEFI" || echo "Legacy BIOS"
```

If the system booted in UEFI mode, the kernel mounts the EFI variables filesystem at `/sys/firmware/efi`. If that directory does not exist, the system booted in legacy BIOS mode.

You can also inspect it manually:

```bash
ls /sys/firmware/efi
```

| Result | Firmware type |
|---|---|
| Directory exists and lists files (e.g. `efivars`, `vars`) | ✅ UEFI |
| `No such file or directory` | ❌ Legacy BIOS |

***

## 1️⃣ UEFI — Enter from Windows

> ℹ️ These methods only work if your system is booted in **UEFI mode**.

### ⚡ Method 1 — Direct command (recommended)

Open PowerShell as Administrator:

```powershell
shutdown /r /fw /t 0
```

Windows passes the `/fw` flag to the UEFI boot manager, which redirects directly to the firmware setup on next boot. This is the cleanest and most reliable method.

### 🪟 Method 2 — Advanced Startup (GUI)

Navigate to:

**Settings → System → Recovery → Advanced startup → Restart now**

Or use the shortcut: hold **Shift** and click **Restart**.

Once in the recovery environment, follow this path:

```
Troubleshoot → Advanced options → UEFI Firmware Settings → Restart
```

### ⚠️ UEFI Limitations

- **Fast Boot** can block keyboard input at POST, but does **not** block the OS-level methods above.
- On some OEM systems or enterprise hardware, firmware bugs may prevent even `/fw` from working. In those cases, fall back to the keyboard method below.

***

## 2️⃣ Legacy BIOS — Enter at Boot

> ⚠️ There is **no OS-level method** to enter a legacy BIOS. Windows has no communication channel with legacy firmware. The only option is keyboard input during POST.

### ⚡ Method 1 — Key press at POST (the only reliable way)

1. Restart the system normally from Windows
2. As soon as the screen turns on (during POST), repeatedly press the firmware key for your manufacturer:

| Manufacturer | Common key(s) |
|---|---|
| Dell | `F2`, `F12` |
| HP | `F10`, `Esc` |
| Lenovo | `F1`, `F2`, `Enter` then `F1` |
| Asus | `DEL`, `F2` |
| Acer | `F2`, `DEL` |
| MSI | `DEL` |
| Generic / unknown | `DEL`, `F2`, `F10` |

### 🐢 Method 2 — Slow down POST (if boot is too fast)

If the system boots too quickly to catch the key press:

- Disable **Fast Boot** from Windows power settings
- Disconnect secondary storage drives to slow down POST enumeration

These are workarounds, not direct entry methods.

***

## 3️⃣ Last Resort — CMOS Reset

If you cannot access the firmware at all (forgotten password, corrupted settings):

- **Jumper method:** locate the CMOS reset jumper on the motherboard and short it for a few seconds with the system powered off
- **Battery method:** remove the CMOS coin cell battery (CR2032) for ~30 seconds, then reinsert it

> ⚠️ Both methods reset **all** BIOS/UEFI settings to factory defaults, including boot order, SATA mode, and any custom configuration.

***

## 4️⃣ Methods at a Glance

| Method | UEFI | Legacy BIOS |
|---|---|---|
| `shutdown /r /fw /t 0` | ✅ | ❌ |
| Shift + Restart (GUI) | ✅ | ❌ |
| Settings → UEFI Firmware Settings | ✅ | ❌ |
| Key press at POST (F2, DEL...) | ✅ | ✅ |
| CMOS reset | ⚠️ fallback | ⚠️ fallback |