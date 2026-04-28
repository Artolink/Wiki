# Installazione di WSL (Windows Subsystem for Linux)

## 🔎 Overview

-   Verifica prerequisiti
-   Installazione WSL
-   Installazione distro Linux
-   Verifica funzionamento
-   Configurazione base

------------------------------------------------------------------------

## 1️⃣ Prerequisiti

Requisiti: 
- Windows 10+ **Pro / Enterprise / Education** (Hyper-V non disponibile su Windows Home)
- Virtualizzazione attiva nel BIOS (Intel VT-x / AMD-V)

### Check virtualizzazione

``` powershell
systeminfo | find "Virtualization"
```

Se disabilitata → abilitarla da BIOS/UEFI.

Vedi quindi [[entrare-nel-BIOS|come entrare nel BIOS]].

------------------------------------------------------------------------

## 2️⃣ Installazione WSL

Apri **PowerShell come Administrator**:

``` powershell
wsl --install
```

### Questo comando:

-   Abilita feature Windows necessarie
-   Installa WSL2
-   Installa Ubuntu automaticamente

Riavvia Windows quando richiesto.

------------------------------------------------------------------------

## 3️⃣ Primo avvio

Dopo il reboot: 
- Parte automaticamente Ubuntu 
- Imposta: 
	- username 
	- password

⚠️ Password valida solo per Linux

------------------------------------------------------------------------

## 4️⃣ Verifica installazione

``` powershell
wsl --list --verbose
```

Controlla: 
- distro presente 
- VERSION = 2

Se non è 2:

``` powershell
wsl --set-version Ubuntu 2
```

------------------------------------------------------------------------

## 5️⃣ Installare altre distro

Lista distro:

``` powershell
wsl --list --online
```

Installare Debian:

``` powershell
wsl --install -d Debian
```

------------------------------------------------------------------------

## 6️⃣ Comandi base

Entrare in WSL:

``` powershell
wsl
```

Entrare in distro specifica:

``` powershell
wsl -d Ubuntu
```

Spegnere WSL:

``` powershell
wsl --shutdown
```

------------------------------------------------------------------------

## 7️⃣ File system

Linux: \\wsl\$`\Ubuntu\

Windows dentro Linux: /mnt/c/

------------------------------------------------------------------------

## 8️⃣ Configurazione base

### Aggiornamento sistema

``` bash
sudo apt update && sudo apt upgrade -y
```

### Tool utili

``` bash
sudo apt install -y curl wget git vim net-tools htop
```

------------------------------------------------------------------------

## 9️⃣ WSL2 vs WSL1

WSL2: 
- Kernel Linux reale 
- Migliori performance 
- Networking NAT

👉 Consigliato per Docker, Kubernetes, troubleshooting

------------------------------------------------------------------------

## 10️⃣ Problemi comuni

### WSL non parte

``` powershell
wsl --shutdown
```

### Errore virtualizzazione

Controllare BIOS oppure:

``` powershell
bcdedit /set hypervisorlaunchtype auto
```

------------------------------------------------------------------------
