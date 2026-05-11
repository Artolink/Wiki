---
title: "Libvirt: the universal VM manager"
tags:
---

## What excactly is Libvirt

Libvirt **is not** the program that runs the VMs.

It is a **universal manager** for the backend software that actually runs them.

Each backend driver that runs VMs (KVM/QEMU, ESXi, Hyper-V, LXC...) talks a different language (in other words, they have their own CLI, APIs, GUI...), so without libvirt, you would need to learn and manage each one separately. 

Libvirt solves this problem by providing one universal language for every virtualization backend.

To actually achieve that, Libvirt has got a Toolkit, that consists of:

- **daemon (libvirtd):** the service that runs in background and waits for your user input
- **CLI (virsh):** the command-line interface for talking with libvirtd
- **API:** the programming interface (and libraries such as libvirt.so) for talking with libvirtd via coding, scripts and applications 
- **GUI (virt-manager):** the graphical interface to interact with libvirtd
- ...

This way, virtualization drivers can focus on *running* the VMs, while Libvirt can think on how to *manage* them, for example: 
- defining and storing VM configurations
- starting VMs automatically at boot
- managing virtual networks and storage
- creating snapshots
- monitoring VM state and lifecycle
- ...

Now, these backend drivers are stateless: they don't have a way to create persistent VMs.

So if we create a VM using QEMU:
```bash
qemu-system-x86_64 \  
-m 4096 \  
-smp 4 \  
-drive file=disk.qcow2
```

We need to ask ourselves a few questions: 
- where is this VM saved?
- who remembers its existance?
- who runs it at boot?
- who keeps the CPU/RAM/network/storage configuration?

And the answer is: **nobody**.

But if we create a VM using Libivrt (`virt-install` is just a wrapper that generates the XML and runs `virsh define` + `virsh start` for you):
```bash
virt-install \
  --name mymachine \
  --memory 4096 \
  --vcpus 2 \
  --disk size=20,pool=default \
  --cdrom /isos/ubuntu.iso \
  --osinfo ubuntu22.04 \
  --network network=default \
  --graphics spice
```

Libvirt itself saves the VM definition in a **XML** file.

This XML file is backend-agnostic, so you can write it yourself, and libvirt will handle the translation in the language spoken by the backend driver.

Once you've created your XML file, you can then create the VM by also passing it directly via:
```bash
virsh define vm.xml
```

## Where it sits in the stack

```
                    User / Software
                            │
                    ┌───────┴────────┐
                    │    Clients     │   virsh (CLI), virt-manager (GUI),
                    │                │   API libraries (libvirt.so + bindings)
                    └───────┬────────┘
                            │  libvirt protocol (Unix socket or TCP/TLS)
                    ┌───────┴────────┐
                    │    libvirtd    │   stores XML definitions,
                    │    (daemon)    │   dispatches to the right backend
                    └───────┬────────┘
                            │  translates XML → backend-native config
       ┌────────────────────┴─────────────────────────┐
       │              Backend drivers                 │
       │  KVM/QEMU · LXC · ESXi · VirtualBox          │
       │  Hyper-V · Xen · bhyve · ...                 │
       └────────────────────┬─────────────────────────┘
                            │
                            ▼
                        Running VMs
```

For example, when you run `virsh start mymachine`, virsh sends a request over a Unix socket to `libvirtd`, which loads the XML definition of `mymachine`, sees it's a QEMU/KVM machine, and spawns the right `qemu-system-x86_64` process with the right flags. 

You never had to touch QEMU directly.

## Core concepts

- **Domain**: libvirt's word for *a single VM instance*. Each domain has a name, a UUID, and an XML config (CPU, RAM, disks, NICs, ...)
- **Hypervisor driver**: the backend libvirt is talking to: `qemu`, `lxc`, `xen`, `vbox`... 
- **Connection URI**: how a client tells libvirt *who* to connect to and *with which driver*:
  - `qemu:///system`: local QEMU/KVM, system-wide (needs root or `libvirt` group)
  - `qemu:///session`: local QEMU/KVM, user-owned (no privileged things like bridges)
  - `qemu+ssh://user@host/system`: remote host over SSH
  - `lxc:///`: local LXC containers
- **Network**: a libvirt-managed virtual network (NAT, bridged, isolated). `default` is NAT, `192.168.122.0/24`.
- **Storage pool / volume**: abstraction over where disk images live. A *pool* is a directory (LVM VG, NFS share...), a *volume* is a file/disk inside a pool.

## Day-to-day commands

`virsh` is the universal CLI. 

Set `LIBVIRT_DEFAULT_URI=qemu:///system` once in your shell (or pass `-c qemu:///system` every time) so you don't use the wrong driver (if you are using QEMU, of course).

### Domain lifecycle

```bash
virsh list --all                       # all defined domains, with state
virsh start <name>                     # boot a stopped one
virsh shutdown <name>                  # graceful (ACPI)
virsh destroy <name>                   # hard power-off (the cable pull)
virsh reboot <name>                    # graceful reboot
virsh suspend <name>                   # pause (RAM kept in place)
virsh resume <name>                    # un-pause
virsh autostart <name>                 # start on libvirtd boot
```

### Inspection

```bash
virsh dominfo <name>                   # state, vCPU, RAM, persistence
virsh domiflist <name>                 # interfaces + bridges + MACs
virsh domifaddr <name>                 # current IP addresses (needs guest agent or dhcp)
virsh dumpxml <name>                   # full XML config (what libvirt knows)
virsh console <name>                   # attach to serial console (Ctrl+] to detach)
```

### Define / clone / remove

```bash
virsh edit <name>                      # opens XML in $EDITOR; takes effect at next start
virsh define mymachine.xml             # register a new domain from XML
virsh undefine <name>                  # remove the definition (keeps disk files)
virsh undefine <name> --remove-all-storage   # also delete the disks
virt-clone --original src --name dst --auto-clone   # clone (incl. disks)
```

### Networks

```bash
virsh net-list --all
virsh net-start default
virsh net-autostart default
virsh net-dumpxml default              # see the NAT range, DHCP leases, etc.
```

### Storage

```bash
virsh pool-list --all
virsh pool-start <pool>
virsh vol-list <pool>
virsh vol-info <vol> --pool <pool>
```

### Snapshots

```bash
virsh snapshot-create-as <dom> <snap>
virsh snapshot-list <dom>
virsh snapshot-revert <dom> <snap>
virsh snapshot-delete <dom> <snap>
```
