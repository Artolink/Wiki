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

Docker creates a pair of virtual Ethernet interfaces per container. 

On install it creates three networks automatically:

* **bridge**: the `docker0` NIC present in every base install. Different bridge networks don't talk to each other.
* **none**: the container has no network interface.
* **host**: the container joins the **host's** network stack, its network config is identical to the host's.

Others can be created manually (**user-defined**): **macvlan** (bridge mode), **macvlan** (802.1q mode), **ipvlan** (L2), **ipvlan** (L3), **overlay**.

#### Bridge (and user-defined bridge)

Easy to declare, secure, useful to segment networks and traffic (helps switches that struggle with broadcast when there are many hosts). 

The automatic bridge gets a subnet different from the host's (usually `172.17.0.1`), while a **user-defined** bridge lets you pick the subnet.

Containers on the same bridge can talk to each other directly: attaching a container to a Docker network creates a virtual Ethernet interface on it. 

With several containers it behaves like a **switch** (the virtual interfaces are its ports), but this abstraction means you **can't reach a container directly by its private IP**: to reach a service (e.g. nginx:80) you must **publish the port**, mapping it to a port on the host NIC (**port forwarding**).

![[Pasted image 20260623191732.png]]

For the bridge to reach the internet (private subnet), Docker uses **PAT (Port Address Translation)** to map the container's private IP onto the host's IP (≈ SNAT + port forwarding). 

The host's **iptables** rules make this work: the container uses the **host's routing table**, so if the host can reach the internet, so can the container.

![[Pasted image 20260623192039.png]]

![[Pasted image 20260623192200.png]]

> [!NOTE] User-defined bridge bonus: DNS by name
> On the **default** bridge containers can only reach each other by IP. On a **user-defined** bridge, Docker runs an embedded **DNS** so containers resolve each other by **name** automatically. (The container's `/etc/resolv.conf` is otherwise copied from the host.)

> [!IMPORTANT] Port-mapping limit
> If you publish `8080:80` you can't reuse `8080` for a second container. (Docker Swarm later solves this.)

#### Host

The service is exposed as if it were directly on the host, using the host's NIC. 

Upside: no need to publish ports. 

Downside: **no isolation** at all.

![[Pasted image 20260623192343.png]]

#### macvlan (bridge mode)

Combines the benefits of bridge and host... but it's **complex to set up** (and keeps an IP in the host's subnet). 

It runs as if plugged straight into the switch port, which many switches dislike (multiple MACs from one interface), for those that support it you must enable **promiscuous mode** on both switch and host. 

At creation you specify by hand: **driver** (`macvlan`), **subnet** (your router's), **gateway** (router IP), **parent** (host interface used to reach the switch). 

![[Pasted image 20260623192439.png]]

At container start you also set the **network** and a **dedicated IP** (outside the DHCP pool), plus it gets its own MAC.

![[Pasted image 20260623192551.png]]

![[Pasted image 20260623192522.png]]
#### macvlan (802.1q mode)

Like macvlan bridge, but it can create **VLANs**, cleanly separating containers from the router's main network (and allowing an IP in a different class). 

Docker networks provide an automatic **IPAM** ("DHCP-like") and DNS, so a VLAN-tagged network comes up working. 

As with macvlan bridge you configure everything by hand, plus you must set the **VLAN ID** and prepare the **trunk** on the switch.

![[Pasted image 20260623192618.png]]

An also you need to set at container start the **network** and a **dedicated IP** (like macvlan bridge mode).

![[Pasted image 20260623192655.png]]

#### ipvlan (L2)

Solves macvlan's promiscuous-mode problem by **not** assigning a new MAC: containers share the **host's MAC**. 

You still assign an IP at container creation, in the host's network... essentially like macvlan bridge, minus the MAC issue.

![[Pasted image 20260623192813.png]]

![[Pasted image 20260623192848.png]]

#### ipvlan (L3)

Everything is handled at **Layer 3**: the **host becomes the router** for the containers in the ipvlan-L3 network. 

You don't set a gateway at creation (the parent must be the gateway). 

![[Pasted image 20260623192948.png]]

Like macvlan 802.1q, it allows separate subnets, but out of the box **nobody can reach anyone**.

To enable reachability, add a **static route** on the router: "to reach *container IP*, ask host *host IP*".

![[Pasted image 20260623193025.png]]

![[Pasted image 20260623193006.png]]

#### Overlay

The overlay network lets containers on **different Docker hosts** talk to each other as if they were on the same LAN, without you touching host routing. 

It's the network you use to go multi-host.

**How it works: VXLAN.** 

Docker wraps each container's L2 frame inside a **VXLAN** packet (an L2-over-L3 tunnel) and ships it over the physical network as **UDP** to the destination host, which unwraps it. 

Each overlay gets its own VXLAN ID, so different overlays stay isolated.

Ports to open **between the hosts**:

| Port               | Plane      | Purpose                                       |
| ------------------ | ---------- | --------------------------------------------- |
| **TCP 2377**       | management | Swarm cluster management (join, manager API)  |
| **TCP + UDP 7946** | control    | node-to-node discovery / gossip (membership)  |
| **UDP 4789**       | data       | **VXLAN**: the encapsulated container traffic |

**You need Swarm.** 

Multi-host overlay is a **Swarm** feature: you form a swarm with `docker swarm init` / `docker swarm join` (an orchestrator, like Kubernetes, a single-node swarm is fine too). 

Once joined, the result is a single network spanning hosts: a distributed system where every container reaches all the others regardless of which host runs it.

**What the overlay gives you for free:**

- **Embedded DNS**: containers/services resolve each other by **name**, across hosts.
- **Service discovery + load balancing**: a Swarm **service** gets a **virtual IP (VIP)**, so traffic to the service name is balanced across its replicas (via IPVS).
- **Routing mesh**: a published port is reachable on **every** swarm node. The mesh routes the request to a node actually running the service. Docker provides a default **`ingress`** overlay for this, plus a **`docker_gwbridge`** for each container's outbound/external traffic.

**Using it:**

```bash
docker network create -d overlay mynet                 # on a manager
docker service create --network mynet ...              # normal Swarm path
docker network create -d overlay --attachable mynet    # also usable by plain `docker run`
docker network create -d overlay --opt encrypted mynet # IPsec on the data plane (off by default)
```

![[Pasted image 20260623193156.png]]

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

## Commands

### Basic Commands

A visual summary of the core commands and how things move between **Dockerfile → images → containers → registry**:

![[Pasted image 20260624104025.png]]

#### The Dockerfile & build

A **Dockerfile** is the config file used to build an image. 

It must be named exactly **`Dockerfile`** (capital D). 

This is the Dockerfile of a Node.js app:
```dockerfile
FROM node:14            # base image: Node.js 14, our starting point
WORKDIR /app            # working directory inside the image
COPY package.json .     # copy the dependency manifest into /app
RUN npm install         # install the dependencies
COPY . .                # copy the rest of the source code
EXPOSE 3000             # the port the app will listen on
CMD ["npm", "start"]    # startup command
```

Then build it (the `build` arrow → an image):

```bash
docker build -t myapp:1.0 .
```

- **`-t name:tag`** names and tags the image. `docker build .` *works too* but gives you a generated **ID**, which complicates everything, so always tag.
- The **tag** carries any meaningful info you want: `1.0`, `latest`, `beta`…

Run an instance (container) of the image (the `run` arrow):

```bash
docker run -p 3000:3000 myapp:1.0     # -p maps host_port:container_port
```

> [!NOTE]
> You never say *where* the image is: Docker keeps all images in one place, don't move them. To move them across machines, use `docker push`/`pull` against a registry (the versioning workflow).

#### Images

| Action | Command |
|---|---|
| **tag** | `docker tag img img:tag` — add a tag to an existing image |
| **push / pull** | `docker push img` → registry (e.g. Docker Hub); `docker pull img` ← |
| **save / load** | `docker save -o file.tar img` → tarball; `docker load -i file.tar` ← |
| **run** | `docker run [opts] img` → a container (pulls first if the image is missing) |

#### Containers

| Action | Command |
|---|---|
| **stop / start / restart** | `docker stop / start / restart <container>` |
| **commit** | `docker commit <container> img` — a new image from the container's modified state (e.g. before a push) |

### Operational commands

General form: **`docker <object> <action> [--flags] [args]`**. 

Beyond the basics, these are for everyday managing, inspecting and troubleshooting.

#### Inspect & status

| Command                                   | What                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `docker ps -a`                            | all containers, including stopped ones                                            |
| `docker container ls --size`              | adds the actual & virtual size                                                    |
| `docker images`                           | list images                                                                       |
| `docker image / container inspect <id>`   | detailed info (JSON)                                                              |
| `docker logs [-f] <id>`                   | container logs (kept *outside* the container → survive a stop); `-f` follows live |
| `docker stats`                            | live CPU / memory / I/O per container                                             |
| `docker top <id>`                         | processes running inside a container                                              |
| `docker version`                          | engine + client version                                                           |
| `docker info`                             | engine overview (tweak it via `/etc/docker/daemon.json`, created by you)          |
| `docker system df`                        | disk used by images / containers / volumes                                        |
| `docker image history <img>`              | the image's layer-by-layer history                                                |
| `docker compose ls` / `docker compose ps` | compose projects / their containers                                               |

#### Run, exec & access

| Command | What |
|---|---|
| `docker container create` | create without starting |
| `docker container run` | create + start; pulls if missing (from a custom registry use the full URL); `--memory=100m` caps the container's memory (too low → **OOM** crash) |
| `docker run -it <img> <cmd>` | run a one-off command (e.g. `bash`, `ps -ef`) |
| `docker exec -it <id> <cmd>` | run a command **in a running** container (e.g. `bash`) |
| `docker attach <id>` | attach to the main process (**PID 1**) stdout |
| `Ctrl-P  Ctrl-Q` | detach **without** stopping the container |
| `docker cp <id>:/path ./local` | copy files host ↔ container |

#### Cleanup

| Command | What |
|---|---|
| `docker rm <id>` / `docker rmi <img>` | remove a container / an image |
| `docker image prune` | remove **dangling** (unreferenced) images |
| `docker system prune [-a]` | remove all unused data (stopped containers, unused networks, dangling images; `-a` also unused images) |

> [!NOTE]
> `docker rmi -f` on an image used by a **running** container only **untags** it, the layers stay (still referenced) and the container keeps running.

#### Save / transfer

| Command                                           | What                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `docker image save <img>`                         | export an image **with its full structure/metadata**, the right way               |
| `docker load`                                     | import an image tarball                                                           |
| `docker container export` / `docker image import` | export/import a container's filesystem: **loses image metadata, not recommended** |

> [!TIP]
> For moving images around, a **registry** (push/pull) beats save/export every time.

#### Volumes & networks

| Command                                       | What                                              |
| --------------------------------------------- | ------------------------------------------------- |
| `docker volume create / ls / inspect / prune` | manage volumes (local, or NFS/iSCSI… via drivers) |
| `docker network create / ls / inspect`        | manage networks (bridge, overlay…)                |

#### Handy combos

```bash
docker container rm -f $(docker container ls -aq)    # force-remove ALL containers
docker rmi $(docker images -qf dangling=true)        # remove all dangling images
```

## Dockerfile

When you build an image from a Dockerfile, each instruction is a **layer** (mostly) a change on top of the base image (`FROM`).

- **Metadata instructions don't create a layer**: `CMD`, `WORKDIR`, `ENV`, `EXPOSE`, `LABEL`, `USER`… only edit the image's **JSON metadata**, they don't touch the filesystem.
- **Layer caching**: rebuilds don't start from scratch, Docker reuses the layers your change didn't affect, and only rebuilds **from the first changed instruction down**. So *order matters*: put rarely-changing steps first (deps).
- **`--no-cache`** forces a full rebuild (e.g. to actually re-pull `FROM ubuntu:latest` or re-run `RUN apt-get update` and get fresh packages).
- **`.dockerignore`** works like `.gitignore`: it keeps files out of the **build context** (the files sent to the daemon): smaller/faster builds, and avoids leaking secrets.

### Instructions

Directives are written in **UPPERCASE** (convention).

| Instruction   | What it does                                                                                           | Layer?        |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| `FROM`        | base image (`FROM ubuntu:24.04`). `FROM scratch` = empty, no filesystem (the next instruction adds it) | sets the base |
| `RUN`         | runs a command at build time and **commits a new layer** (`RUN apt-get update`). 3 `RUN`s = 3 layers   | ✅             |
| `COPY`        | copy **local** files into the image (`COPY app/ /app`): **the preferred one**                          | ✅             |
| `ADD`         | like COPY but also unpacks local tarballs and fetches **remote URLs**: use only when you need those    | ✅             |
| `WORKDIR`     | set (and create) the working directory for the following instructions                                  | metadata      |
| `CMD`         | default command/args: fully **replaced** if you pass a command at `docker run`                         | metadata      |
| `ENTRYPOINT`  | the **fixed** command: `docker run` args are **appended** to it                                        | metadata      |
| `ENV`         | set environment variables (available at **runtime**)                                                   | metadata      |
| `ARG`         | **build-time** variable (`ARG TARGETARCH`): not present at runtime                                     | —             |
| `EXPOSE`      | **documents** the port the app listens on: it does **not** publish it (you still need `-p`)            | metadata      |
| `USER`        | user (UID/username) the container runs as (avoid `root`)                                               | metadata      |
| `VOLUME`      | declare a mount point for persistent data (stored under `/var/lib/docker/volumes/<name>/`)             | metadata      |
| `LABEL`       | add metadata/labels to the image                                                                       | metadata      |
| `HEALTHCHECK` | command Docker runs to mark the container **healthy/unhealthy**                                        | metadata      |

### CMD vs ENTRYPOINT

* **`CMD`** is a **default that gets replaced**. `CMD ["ping"]` → `docker run myimage 8.8.8.8` tries to run `8.8.8.8` *as a command* → **error**.
* **`ENTRYPOINT`** is the **fixed command**: run-time args are **appended**. `ENTRYPOINT ["ping"]` → `docker run myimage 8.8.8.8` runs `ping 8.8.8.8`. ✓
* **Combine them**: ENTRYPOINT = the command, CMD = default (overridable) args:
  ```dockerfile
  ENTRYPOINT ["ping"]
  CMD ["8.8.8.8"]
  ```
  `docker run myimage` → `ping 8.8.8.8`; `docker run myimage 4.4.4.4` → `ping 4.4.4.4`.

### Build

```bash
docker build -t name:tag .       # same as: docker image build . -t name:tag
```

> [!TIP] Pipe a Dockerfile from STDIN
> ```bash
> cat Dockerfile | docker image build -t myimage -f - .
> ```
> Useful when reading a Dockerfile from a remote location (e.g. via `curl`).

### Best practices

- **Order for the cache**: copy the dependency manifest + install deps **before** copying the code, so a code change doesn't invalidate the dependency layers.
- **Chain `RUN` to cut layers** (and clean up in the *same* layer):
  ```dockerfile
  RUN apt-get update && apt-get install -y curl \
      && rm -rf /var/lib/apt/lists/*
  ```
- Use **`COPY`** over `ADD`: run as a non-root **`USER`**. Start from a small base (`alpine`, `-slim`, `distroless`).
- **`docker build --squash`** collapses the result into a **single layer** (the "squash" operation, handy in performance-sensitive production).

### Multi-stage build

Build in one stage (with the compiler/SDK), then copy **only the artifact** into a slim final image, so the SDK never ships. 

For example (.NET):
```dockerfile
# --- build stage (has the SDK) ---
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG TARGETARCH
WORKDIR /source
COPY aspnetapp/*.csproj .
RUN dotnet restore -a $TARGETARCH
COPY aspnetapp/. .
RUN dotnet publish -a $TARGETARCH --no-restore -o /app

# --- final stage (runtime only) ---
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .          # take ONLY /app from the build stage
USER $APP_UID
ENTRYPOINT ["./aspnetapp"]
```

The key line is **`COPY --from=build /app .`**: it pulls *only* `/app` out of the previous `build` stage into the final image, leaving the SDK and intermediate files behind → a tiny, runtime-only image.

## Docker Compose

Compose is the **declarative** way to run a **multi-container app**: a single YAML file (a "manifest") declares all your services: frontend, API, backend/DB, plus their networks and volumes, instead of typing `docker run` for each by hand.

The file is usually `docker-compose.yml` (not mandatory, use `-f othername.yml` to point elsewhere).

### Dockerfile VS Compose: different jobs

- **Dockerfile** = how to **build one image**.
- **Compose** = how to **run a stack** (and optionally build its images).

They're complementary: in a service, **`build: .`** ≈ `docker build .` (uses your Dockerfile), while **`image: wordpress:latest`** pulls a stock image. 

So you *build* with a Dockerfile and *run* with Compose: Compose just saves you from re-typing every `docker run` flag.

### A compose file

Example `docker-compose.yml`, frontend + API + database:

```yaml
services:
  web:
    build: .                       # build from the local Dockerfile (≈ docker build .)
    ports:
      - "3000:3000"                # ONLY the frontend is published to the host
    environment:
      API_URL: http://api:4000
    depends_on:
      - api
    restart: unless-stopped

  api:
    image: myorg/api:1.0           # prebuilt image, no port published → internal only
    environment:
      DB_HOST: db
    depends_on:
      db:
        condition: service_healthy # wait until the DB is healthy

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      retries: 5

volumes:
  db-data:
```

Run it:

```bash
docker compose up -d       # reads the yaml, builds if needed, starts in the background
docker compose logs -f     # follow the logs
```

(`-d` = detached: containers start in the background and the terminal returns to the prompt immediately)

> [!NOTE] Services talk to each other by name
> Compose creates a network for the project, and each service reaches the others by **service name**: `web` → `http://api:4000`, `api` → `db:5432`. 
> 
> That's why **only the frontend's port is published**: the API and DB are reachable *internally*, so there's no need to expose them on the host.

### Common keys

| Key | What |
|---|---|
| `services` | the containers that make up the app |
| `build` | build the image from a Dockerfile (`build: .`, or `build:` with `context:`/`dockerfile:`) |
| `image` | use a prebuilt image (`image: postgres:16`) |
| `ports` | **publish** to the host (`"host:container"`) |
| `expose` | expose only to other services (internal, not published) |
| `environment` / `env_file` | env vars inline / from a file |
| `volumes` | named volumes or bind mounts for persistence |
| `depends_on` | start order (+ `condition: service_healthy` to actually wait) |
| `networks` | attach services to specific networks |
| `restart` | restart policy (`unless-stopped`, `always`…) |
| `healthcheck` | per-service health probe |
| `command` | override the image's default command |

### Common commands

| Command | What |
|---|---|
| `docker compose up -d` | build (if needed) + start, detached |
| `docker compose down` | stop & remove containers/networks (`-v` also removes named volumes) |
| `docker compose ps` | list the project's containers |
| `docker compose logs -f [svc]` | follow logs (optionally one service) |
| `docker compose build` / `pull` | (re)build / pull images |
| `docker compose restart [svc]` | restart |
| `docker compose exec <svc> sh` | shell into a running service |
| `docker compose config` | validate & render the final merged config |

### Splitting into multiple files

In production it's better to **split the stack across files**, so you can change/redeploy **one component without bringing everything down**:

- `docker-compose.override.yml` is **auto-merged** on top of `docker-compose.yml`.
- Use `docker compose -f base.yml -f prod.yml up -d` to compose per-environment.
- A `.env` file is **auto-loaded** for `${VAR}` substitution in the YAML.

## Docker Swarm

This is **cluster & container orchestration**: turning a group of Docker hosts into one cluster that schedules containers for you. 

The most used orchestrator is **Kubernetes**, but before that, Docker's own built-in solution is **Docker Swarm**.

### The cluster: managers & workers (Raft)

Nodes have two roles:
- **Managers** (control plane): accept your commands and schedule work.
- **Workers**: just run the tasks.

```bash
docker swarm init                              # on the first node → it becomes a manager, prints a join token
docker swarm join --token <token> <mgr-ip>:2377   # on the other nodes
```

Managers keep the cluster state via **Raft consensus**, so they need a **majority (quorum)** to stay operational → always use an **odd number** of managers (3, 5…). 

A worker can be **promoted** to manager.

Ports to open **between nodes**:

| Port | Purpose |
|---|---|
| **2377/TCP** | cluster management (manager communication, `join`) |
| **7946 TCP+UDP** | node discovery / gossip |
| **4789/UDP** | overlay data plane (VXLAN) |

### Stacks & services

- A multi-service app deployed to the swarm is a **stack**, described by a **Compose file** and deployed with:
  ```bash
  docker stack deploy -c docker-compose.yml mystack
  ```
- A stack is made of **services**, each service runs **N tasks** (containers) spread across the nodes.
- **Service modes**:
	- **replicated** (default): N copies spread over the cluster (`--replicas 3`).
	- **global**: exactly **one task per node** (e.g. a log shipper / monitoring agent).

> [!NOTE] Local vs distributed context
> `docker compose up` runs on **one host** → **bridge** network. `docker stack deploy` runs on the **cluster** → **overlay** network. 
> 
> Two extra gotchas for stacks:
> 	- **Images must be in a registry**: every node pulls them, so `build:` is ignored by `stack deploy`, build & **push** first.
> 	- The **`deploy:`** key (replicas, placement, resources, restart policy) is **swarm-only**, so `docker compose up` ignores it.

```yaml
services:
  web:
    image: myorg/web:1.0      # in a registry → nodes pull it
    ports:
      - "8080:90"             # published on EVERY node via the routing mesh
    deploy:                   # ← swarm-only
      mode: replicated
      replicas: 3
      restart_policy:
        condition: on-failure
```

### Networking: overlay + VXLAN

Stack services share an **overlay** network spanning all nodes, built on **VXLAN** (UDP 4789): a container's L2 frame is encapsulated and tunneled host→host through the **TEP (tunnel endpoint)**. 

Each host keeps a **TEP table** (`mac xy → via tep <ip>`) to know which host to forward to. 

the `docker_gwbridge` (172.17.0.x) wires containers to the overlay and to the outside.

![[Pasted image 20260624210623.png]]

### Routing mesh & VIP

When you publish a service port (e.g. `8080:90`), the **routing mesh** makes it reachable on **every** node: hit *any* node on 8080 and the mesh routes you to a task, even one running on a different node.

Each service also gets a **VIP (virtual IP)**: clients resolve the service **name** → VIP, and Docker (IPVS) **load-balances** across the service's tasks (round-robin).

![[Pasted image 20260624210705.png]]

### Storage (the hard part)

Tasks move between nodes, so **local disk isn't enough** for stateful data. 

Use **shared storage** reachable from every node, e.g. an **NFS volume** (`nfs://nfs/webvol/xyz` mounted at `/var/data/xyz`), so wherever a task lands, it sees the same data.

Anything **custom beyond the image** (DB init scripts, config, credentials) comes from **outside**, not baked in: **env vars**, mounted **volumes**, and Swarm's own **`docker config`** / **`docker secret`** (injected into the service at runtime).

### Key commands

| Command | What |
|---|---|
| `docker swarm init` / `join` | create / join the swarm |
| `docker node ls` / `docker node promote <node>` | list nodes / promote a worker to manager |
| `docker service create --replicas 3 -p 8080:90 --name web img` | create a service |
| `docker service ls` / `docker service ps web` | services / a service's tasks |
| `docker service scale web=5` | scale a service |
| `docker stack deploy -c file.yml mystack` | deploy a stack |
| `docker stack services / ps mystack` / `docker stack rm mystack` | inspect / remove a stack |
| `docker secret create` / `docker config create` | inject secrets / config into services |

> [!NOTE] Swarm vs Kubernetes
> Swarm is the **simplest** orchestrator: built into Docker, driven by Compose files, quick to stand up. 
> 
> **Kubernetes** is far more powerful and complex (the industry standard), so reach for K8s at production scale. 
> 
> Swarm shines for small clusters and learning, I suggest **hands-on**: stand up a 3-node swarm and deploy a stack to make the pieces click.