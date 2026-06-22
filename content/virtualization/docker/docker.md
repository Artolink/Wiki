---
title: "🐳 Docker: architecture & fundamentals"
tags:
  - Basics
---

## Introduction

Docker is a software platform to **build, test and ship applications fast**. 

It packages software into standardized units called **containers** that include everything the app needs to run: code, runtime, system tools and libraries.

Before Docker we relied on **virtualization** (Hyper-V, VMware…), but virtualization showed clear limits: it offers strong isolation, but at a **heavy resource cost**, because every VM makes the host run a full guest OS *on top of* the actual application. 

That sharply limits how many VMs a single host can run. 

VMs are also hard to migrate between environments (the **OVF (Open Virtualization Format)** standard tries to ease this).

![[Pasted image 20260622164759.png]]

![[Pasted image 20260622172853.png]]

> [!NOTE] Containers vs VMs in one line
> A **VM** virtualizes the **hardware** and runs a full guest **kernel + OS** per machine, a **container** shares the **host kernel** and only isolates the process: far lighter, many more per host.

***

## Theory

Using Docker to build and run containers makes distributed systems simpler: different apps/processes run independently on the same physical machine, and you deploy new nodes only when needed. 

This enables **PaaS** (Platform as a Service), **CaaS** (Container as a Service) and similar models. 

Today Docker is used heavily by **DevOps**, also thanks to its Git-like **image/registry versioning**.

### What the OS must provide for isolation

Container isolation isn't magic — it's three families of **Linux kernel features** working together!

- **Namespaces**: control *what a process can **see*** (its own filesystem, network, PID tree, hostname, users…).

- **cgroups**: control *what a process can **use*** (CPU, memory, I/O…).

- **Security / syscall restrictions**: control *what a process can **do*** (SECCOMP, SELinux, AppArmor).

The same building blocks power alternatives like **Podman** (daemonless, rootless-friendly), e.g. the AWX execution nodes use Podman, not Docker.

Each is detailed below.

#### Linux namespaces

Namespaces are "zones" that abstract the resources the kernel offers: Docker creates a set of them per container, and attaches the container's processes to them.

* **Mount (filesystem)**: a separate filesystem view via mount points and `chroot` (which changes a process's apparent root directory). ⚠️ `chroot` alone only isolates the filesystem, not everything around it, it's a weak security on its own!
* **Network (netns)**: separate network areas with their own routing tables, interfaces and loopback. This means a nginx container can use port 80 even if another container runs apache2 on 80 (though when you **map** ports to the host, the host-side ports must differ).
* **PID**: a separate process tree. Among the processes you'll find `dockerd` and **`containerd`** (its child), which manages the container lifecycle (create/delete/start/stop) and spawns **`containerd-shim`**, mapped as **PID 1** inside the container (as if it were init). This gives the container an isolated PID with no host parent. *Kill the shim and the container dies.*
* **IPC**: inter-container communication over an internal socket (not TCP/IP, that's used for containers on *different* hosts).
* **UTS**: each container's own identity: **hostname** and NIS domain name. Default hostname is the container ID under Docker (Kubernetes uses the host's name instead).
* **User**: each container has its own user/group IDs and its own `root` (always UID 0). 
  Tip: map by **UID**, not username.

![[Pasted image 20260622165352.png]]

Together, namespaces (isolation/sandboxing) and cgroups (resource control) let you run **multi-tenancy** on a single Linux host, without a hypervisor.

#### Control Groups (cgroups)

![[Pasted image 20260622173600.png]]

cgroups manage and **limit** the resources used by a group of processes (CPU, memory, disk/network I/O, devices…), organized **hierarchically** as a tree. 

You interact through `/sys/fs/cgroup`, creating a subdirectory creates a cgroup. 

Example: cap PID 1234 to 100 MB:

```bash

mkdir /sys/fs/cgroup/memory/mycgroup

echo 104857600 > /sys/fs/cgroup/memory/mycgroup/memory.limit_in_bytes

echo 1234 > /sys/fs/cgroup/memory/mycgroup/cgroup.procs

```

> [!NOTE] cgroup v1 vs v2
> The example is **v1**. Modern distros default to **v2** (unified hierarchy): the equivalent file is `memory.max`. Same concept.

A container does **not** abstract hardware (unlike a VM): no dedicated kernel per container, calls are just *limited* since everyone talks to the **same kernel**. 

Without cgroups every container would see the **whole** hardware.

![[Pasted image 20260622172943.png]]

> [!WARNING] No swap by default → OOM
> Containers have no swap by default → risk of **OOM** kills (e.g. Java's 2 GB heap that isn't there), which crashes the container.

cgroups were developed by Google, made public, and used natively on every systemd-based Linux.

#### Container security & syscall restrictions

* **SECCOMP** (secure computing mode): blocks ~40 dangerous syscalls containers don't need. Admins can write custom profiles (the equivalent in Kubernetes is the *security context*).
* **SELinux**: restricts which (dangerous) operations the OS allows.
* **AppArmor**: similar, profile-based confinement.

All of these are **Linux kernel features**.

On **security**, Docker can still improve, which is why virtualization still exists: in a VM, isolation and resource policy are the **hypervisor's** job, but with containers those duties fall **directly on the host kernel**.

> [!INFO]- LXC → Docker → libcontainer / containerd / runc
> **LXC (Linux Containers)** is the most complete "vanilla" Linux container manager, it works even with an unmodified kernel.
>
> In **2013 Docker** was born, initially built on **LXC**, then it dropped LXC in favour of **libcontainer** (contributed by Google).
>
> Today:
> * **containerd** is the container **runtime daemon**: it uses the libcontainer/OCI APIs and provides the core lifecycle features, using **runc** as its default runtime.
> * **runc** does the **actual execution** of the container: creating namespaces, managing processes inside it.
> * To be a "container", it must meet the **OCI (Open Container Initiative)** specs that runc implements. runc can be used on its own by people who want containers without all of Docker's features.
>
> So Docker is **much more than LXC**: it streamlines building images, shipping them, versioning, and so on.
> 
> 
![[Pasted image 20260622173447.png]]

### Docker architecture

![[Pasted image 20260622174041.png|697]]

> [!INFO]
> Kubernetes handles all of this on its own, *except* running the containers, which it delegates to a runtime (Docker or others).

The **Docker Engine** is made of the components seen above:

* **Docker Server / Daemon / Engine**: all of Docker's functionality, exposed via an **API**.
* **Docker Client**: what you use to talk to the engine via commands (`docker <command>`): manage containers, networks, images and data volumes.

On install, Docker creates `/var/lib/docker/`, the default location for system data:

* **`containers/<long-id>/`**: running containers' data and state. `<long-id>-json.log` are the `docker logs <id>` logs (key for debugging).
* **`image/`**: container images (OS filesystem + metadata).
* **`volumes/`**: Docker volume data (persistence / shared / sensitive data).
* **`network/`**: network config and state.
* **`tmp/`**: temporary data (e.g. image downloads).
* **`overlay2/`**: the **image layers**.

### Docker images

A Docker **image** is a template containing everything an app needs. 

Docker uses an image to create one or more **containers**: running instances of that image. 

Containers are portable because images are a **standard format** any host with Docker can read and run: a container's content is libraries, executables, filesystem branches, config files, scripts… so shipping an app reduces to **building an image**.

Each image is also a set of **immutable layers**.

Each layer is a filesystem and they're all **read-only**: when you run a container, a new **writable** layer is added on top. Multiple images can reference the same layers (**layer sharing**), they're overlapping directories where the upper one overrides the lower, so **the topmost wins**. 

This is done by **storage drivers** (e.g. `overlay2`), which record the changes.

Each container has a **thin R/W layer** over the image: data you want to keep goes into **Data Volumes**, not consolidated back into the image. 

![[Pasted image 20260622174850.png]]

These two containers from the same image don't take 2× the space: they **share** the read-only layers and only add their own thin R/W layer.

> [!TIP] Where layers come from
> Images live in **registries**: Docker Hub (public) or a private one (e.g. the GitLab Container Registry). `
> 
> docker pull image:tag` fetches the layers, `docker push` uploads them. 
> 
> The `repository:tag` (e.g. `nginx:1.27`) names a specific image: `latest` is just the default tag, not "newest guaranteed".

### Container lifecycle & restart policies

A container moves through states:

**created** (built but not started) → **running** → **paused** (`docker pause`, processes frozen) → **stopped/exited** (the main process ended, or `docker stop`) → **removed** (`docker rm`).

`docker ps` shows running containers; `docker ps -a` includes the exited ones.

**Restart policies** (`--restart` on `docker run`, or `restart:` in Compose) tell Docker what to do when a container exits, this is container-level **self-healing**:

| Policy | Behaviour |
|---|---|
| `no` *(default)* | never restart |
| `on-failure[:N]` | restart only on a non-zero exit (optionally up to N times) |
| `always` | always restart (even after a daemon restart / reboot) |
| `unless-stopped` | like `always`, but **not** if you stopped it manually |

### Healthcheck

A **healthcheck** tells Docker whether a container is not just *running* but actually *healthy* (the app inside really responds). 

Defined in the Dockerfile (`HEALTHCHECK`) or Compose (`healthcheck:`), it runs a command periodically and sets the container status to **healthy** / **unhealthy** (visible in `docker ps`):

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 20s
```

It matters because orchestrators use that status: Compose (`depends_on: condition: service_healthy`), Swarm and Kubernetes gate startup on it, restart unhealthy instances, and route traffic only to healthy ones.

### Data Volumes (and DVContainers)

**Data Volumes** handle **persistent or shared** data between containers (e.g. auto-initialized on container creation). 

When a container is deleted, Docker **never** deletes its volumes automatically.

Create a volume with `-v` on `docker create`/`docker run` (repeatable for several volumes): the same volume can be mounted on multiple containers to share data. 

Locate an existing volume with `docker inspect`.

A **Data Volume Container** is a container made specifically to hold/manage a volume:

```bash
docker create -v /data --name data_container my_image          # holds a volume at /data
docker run --volumes-from data_container my_image              # other containers mount it
```

> [!NOTE] Volumes vs bind mounts
> `-v name:/path` uses a **named volume** managed by Docker (under `/var/lib/docker/volumes/`). 
> 
> `-v /host/path:/path` is a **bind mount** of a host directory.

### Docker networking

Docker creates a pair of virtual Ethernet interfaces per container. On install it creates three networks automatically:

* **bridge** — the `docker0` NIC present in every base install. Different bridge networks don't talk to each other.
* **none** — the container has no network interface.
* **host** — the container joins the **host's** network stack; its network config is identical to the host's.

Others can be created manually (**user-defined**): **macvlan** (bridge mode), **macvlan** (802.1q mode), **ipvlan** (L2), **ipvlan** (L3), **overlay**.

#### Bridge (and user-defined bridge)

Easy to declare, secure, useful to segment networks and traffic (helps switches that struggle with broadcast when there are many hosts). The automatic bridge gets a subnet different from the host's (usually `172.17.0.1`); a **user-defined** bridge lets you pick the subnet.

Containers on the same bridge can talk to each other directly: attaching a container to a Docker network creates a virtual Ethernet interface on it. With several containers it behaves like a **switch** (the virtual interfaces are its ports). But this abstraction means you **can't reach a container directly by its private IP** — to reach a service (e.g. nginx:80) you must **publish the port**, mapping it to a port on the host NIC (**port forwarding**).

*(🖼️ diagram: bridge network as a virtual switch + host port mapping)*

For the bridge to reach the internet (private subnet), Docker uses **PAT (Port Address Translation)** to map the container's private IP onto the host's IP (≈ SNAT + port forwarding). The host's **iptables** rules make this work; the container uses the **host's routing table**, so if the host can reach the internet, so can the container.

*(🖼️ diagram: veth pair, netns, iptables NAT, host routing)*

> [!NOTE] User-defined bridge bonus: DNS by name
> On the **default** bridge containers can only reach each other by IP. On a **user-defined** bridge, Docker runs an embedded **DNS** so containers resolve each other by **name** automatically. (The container's `/etc/resolv.conf` is otherwise copied from the host.)

> [!IMPORTANT] Port-mapping limit
> If you publish `8080:80` you can't reuse `8080` for a second container. (Docker Swarm later solves this.)

#### Host

The service is exposed as if it were directly on the host, using the host's NIC. Upside: no need to publish ports. Downside: **no isolation** at all.

*(🖼️ diagram: host networking)*

#### macvlan (bridge mode)

Combines the benefits of bridge and host — but it's **complex to set up** (and keeps an IP in the host's subnet). It runs as if plugged straight into the switch port, which many switches dislike (multiple MACs from one interface) — for those that support it you must enable **promiscuous mode** on both switch and host. At creation you specify by hand: **driver** (`macvlan`), **subnet** (your router's), **gateway** (router IP), **parent** (host interface used to reach the switch). At container start you also set the **network** and a **dedicated IP** (outside the DHCP pool) — plus it gets its own MAC.

*(🖼️ diagram: macvlan bridge mode)*

#### macvlan (802.1q mode)

Like macvlan bridge, but it can create **VLANs**, cleanly separating containers from the router's main network (and allowing an IP in a different class). Docker networks provide an automatic **IPAM** ("DHCP-like") and DNS, so a VLAN-tagged network comes up working. As with macvlan bridge you configure everything by hand — plus you must set the **VLAN ID** and prepare the **trunk** on the switch.

*(🖼️ diagram: macvlan 802.1q with VLAN trunk)*

#### ipvlan (L2)

Solves macvlan's promiscuous-mode problem by **not** assigning a new MAC: containers share the **host's MAC**. You still assign an IP at container creation, in the host's network. Essentially like macvlan bridge, minus the MAC issue.

*(🖼️ diagram: ipvlan L2)*

#### ipvlan (L3)

Everything is handled at **Layer 3**; the **host becomes the router** for the containers in the ipvlan-L3 network. You don't set a gateway at creation (the parent must be the gateway). Like macvlan 802.1q, it allows separate subnets — but out of the box **nobody can reach anyone**.

To enable reachability, add a **static route** on the router: "to reach *container IP*, ask host *host IP*".

*(🖼️ diagram: ipvlan L3 with static route on the router)*

#### Overlay

Used when working across **multiple hosts** (covered in detail later). Between hosts open:

* **UDP 4789** — data plane (data packets)
* **TCP/UDP 7946** — control plane (routing protocols)

Once you have several Docker machines, **Docker Swarm** joins them into a swarm (an orchestrator; it also runs **standalone** on one host). The result is a single network spanning hosts — a distributed system. Start the containers on each host specifying the **network name**, and every container can reach all others regardless of which host it runs on.

> [!WARNING]
> The overlay network must **already exist** — create it first.

*(🖼️ diagram: overlay network across multiple hosts)*

## Installation

On Debian/Ubuntu, the quickest path is the official convenience script:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"     # run docker without sudo (re-login after)
docker run hello-world              # verify
```

But for production, prefer the official apt repository (pinned versions) over the convenience script. 

Check out https://docs.docker.com/engine/install/ and select your OS.

***
