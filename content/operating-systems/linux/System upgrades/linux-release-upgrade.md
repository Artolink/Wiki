---
title: "1. Release upgrade: bring your distro to the next release"
tags:
  - Maintenance
---

> [!IMPORTANT]
> **Always check the release notes first**: they list known issues, breaking changes, and recommended pre-upgrade actions for the specific package versions you're about to install.
>
> - [Ubuntu Server upgrade guide](https://ubuntu.com/server/docs/upgrade): official version-specific notes.
> - [Debian release notes](https://www.debian.org/releases/) : same idea, more important for Debian major upgrades.
^check

Unlike a [patch upgrade](linux-patch-management), a **release upgrade** moves the system from one major release to the next (Ubuntu 22.04 → 24.04, Debian 11 → 12...). 

That means **kernel, libc, init system, sources.list, and dozens of configs all change in one shot**.

There is **no official downgrade path**: if you mess this up, you either have to:

- Roll back from a snapshot
- Rebuild the server from scratch
- Fix everything manually

For this reason, before touching anything:

- [ ] Walk through the full [pre-upgrade checks](linux-pre-upgrade-checks) (recon, snapshot, system-state backup, pre-flight).
- [ ] Read the release notes for the *exact* version jump you're doing.
- [ ] Have a clear [rollback plan](linux-upgrade-rollback) in mind before you start. 

This page assumes the safety net is already in place.


## Pick the right approach

There are three different roads for accomplishing a release upgrade. 

Here you find a general overview:

| Strategy                                                      | When to use it                                                                                                                                      | Pro                                                                                                                                                 | Contro                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **A. Automatic:**<br>`do-release-upgrade` (Ubuntu)            | You're on Ubuntu and want the "Canonical-supported" path: it knows about EOL repos, third-party PPAs, deprecated packages, and post-release fixups. | Handles the most edge cases automatically. Cleans up `cloud-archive`, disables incompatible PPAs, prompts on real conflicts only.                   | Ubuntu-only. <br>Can take 1-3h.                                                                                    |
| **B. Manual:**<br>editing `sources.list` + `apt dist-upgrade` | Debian (no `do-release-upgrade`) or Ubuntu if you want full control over what runs.                                                                 | No magic. <br>You decide every step.<br>Faster on small servers.                                                                                    | No automatic cleanup. <br>PPAs and `cloud-archive` need manual care.<br>Easier to get wrong if you miss something. |
| **C. Redeploy from scratch**                                  | Immutable infra, IaC-managed (Ansible, Terraform…), stateless servers, or anything you can rebuild faster than you can debug.                       | Pristine state, no half-old half-new hybrids.<br>No need to shut down the old VM, **unless** the new one needs to have the same IP or hostname.<br> | Needs the automation already in place. Stateful data must be migrated separately.                                  |
So, by seeing this you could think:

- "**Option A** is the best, its the default/standard for Ubuntu"
- "**Option C** can be good and really clean, if my company has solid automation pipelines in place"
- "**Option B** is risky, hence stupid to do in production"

But the reality is, from my personal experience, in production you have to go with option **B** most of the time.

Why is that?

Because with option **A**, `do-release-upgrade` updates **everything**: this means every custom repository that you have under `/etc/apt/sources.list.d/`, not just the Ubuntu ones!

For example, in my VPS I currently have Docker and Tailscale:
```bash
/etc/apt/sources.list.d$ ls
	docker.list  tailscale.list
```

What if I don't want to update their repositories to the next release? But `do-release-upgrade` does exactly that: it changes the release under **every** repository, and then upgrades.
  
Two reasons this hurts you in production:

1. **State**: for anything that holds state (databases like PostgreSQL, MySQL, MariaDB, MongoDB, queue brokers like RabbitMQ, storage layers like Ceph...) a "just bump it" upgrade is a recipe for unbootable schemas, missing migration steps, or silent data corruption. 
   Many of these have their own upgrade procedure (`pg_upgrade`, `mysql_upgrade`…) that must run **between** old and new versions, with the application stopped, often with a backup taken right before.

2. **Compatibility matrices**: vendor-supported and integration-heavy software often comes with an explicit compatibility matrix: which versions are certified together, which kernel/libc/glibc/etc. they support, which bugs are known on a specific combination. 
   Letting `do-release-upgrade` push everything forward at once can land you on a combo that:
	
	- **isn't certified**: you lose vendor support for the whole stack
	- **has known bugs** you specifically didn't want to inherit
	- **isn't supported yet**: the vendor hasn't released a build for the new OS release
	- **silently breaks an integration** you didn't even know existed (e.g. a kernel module that no longer compiles against the new headers)

Both points have the same root cause: **a release upgrade is an OS event, not an everything event**. 

Other software has its own release cycle and its own constraints, and should be upgraded on its own schedule.

So the rule of thumb is:
> [!IMPORTANT]
> If the server in production runs **anything stateful, vendor-certified, or business-critical**, do the OS upgrade with Option **B** and upgrade those services **separately**, each with its dedicated procedure and against its own compatibility matrix.

Now that we've said that, let's actually see the 3 procedures.


## A: `do-release-upgrade` (Ubuntu)

The Ubuntu-supported path. The tool handles `sources.list` rewrite, EOL/incompatible PPA disable, removed-package cleanup, and asks about config conflicts that *really* need a decision.

###  <input type="checkbox"> 1. Start inside a `screen`

If SSH drops mid-upgrade, the process keeps running and you reconnect to it. **Never run a release upgrade without one.**

```sh
screen -S upgrade
# (later: detach with Ctrl+A then D; reattach with `screen -r upgrade`)
```

###  <input type="checkbox"> 2. Belt-and-braces config backups

The pre-upgrade snapshot script already covers `/etc`, but a release upgrade is heavy: a few duplicate backups of the files most likely to be rewritten cost nothing.

```sh
mkdir -p /root/backup-release-upgrade
cp -a /etc/netplan/        /root/backup-release-upgrade/   # network config gets rewritten more often than you'd expect
cp -a /etc/ssh/            /root/backup-release-upgrade/   # never lose sshd_config
cp -a /etc/fstab           /root/backup-release-upgrade/
cp -a /etc/apt/            /root/backup-release-upgrade/   # in case the upgrade leaves a broken sources.list
```

###  <input type="checkbox"> 3. Bring the current release fully up to date

`do-release-upgrade` refuses to run if the current release has pending updates. Patch first, then upgrade the release.

```sh
apt update
apt upgrade -y
apt autoremove -y
apt clean

# If a reboot is now required (new kernel installed), do it first.
[ -f /var/run/reboot-required ] && reboot
```

> [!TIP]
> If your normal patch flow is already a script (see [Patch management](linux-patch-management)), run it here. Same outcome, same safety gates.

###  <input type="checkbox"> 4. Tell dpkg to keep your existing configs

By default, the release upgrade will prompt you for every customised config file it finds. We want it to **silently keep what we have**, except where conflicts genuinely need a human.

```sh
cat > /etc/apt/apt.conf.d/local-keep-configs <<'EOF'
DPkg::options { "--force-confdef"; "--force-confold"; }
EOF
```

What these do:
- `--force-confdef` → if dpkg sees a conflict and a default action is available, take it.
- `--force-confold` → otherwise, keep the **old** (your customised) version.

The new upstream version is preserved alongside as `*.dpkg-dist` so you can diff and merge later (see the [post-upgrade checks](linux-post-upgrade-checks)).

###  <input type="checkbox"> 5. Run the release upgrade

Non-interactive mode answers default-yes on any prompt the tool considers safe:

```sh
export DEBIAN_FRONTEND=noninteractive
do-release-upgrade -f DistUpgradeViewNonInteractive
```

This will:
1. Disable third-party PPAs known to be incompatible.
2. Rewrite `sources.list` to the new release (e.g. `jammy` → `noble`).
3. `apt update` against the new repos.
4. Calculate the upgrade plan and run `apt dist-upgrade`.
5. Remove packages obsolete in the new release.

Expect **1-3 hours** depending on the server. Watch it from a **second SSH session** (open *before* you start), tailing logs:

```sh
# In the second session:
tail -f /var/log/dist-upgrade/main.log
journalctl -f
```

###  <input type="checkbox"> 6. Reboot, then verify

The tool prints `System upgrade is complete.` at the end. Reboot once, then jump straight to verification.

```sh
reboot
# After it comes back:
lsb_release -a                 # confirms the new release
uname -r                       # confirms the new kernel
systemctl is-system-running    # "running" or "degraded" (if degraded → systemctl --failed)
```

Then walk through the full [post-upgrade checks](linux-post-upgrade-checks).


## B: manual sources editing

The "expert" path. 

Works on Debian (where `do-release-upgrade` doesn't exist) or when you want full visibility into what runs.

You're doing manually what `do-release-upgrade` automates: rewrite `sources.list`, then upgrade. The risk is **missing cleanup steps** (deprecated PPAs, `cloud-archive`, Snap-only packages on Ubuntu...) — the tool would have caught them.

###  <input type="checkbox"> 1. Same boilerplate as Option A

```sh
screen -S upgrade

# Belt-and-braces backups
mkdir -p /root/backup-release-upgrade
cp -a /etc/netplan/  /root/backup-release-upgrade/
cp -a /etc/ssh/      /root/backup-release-upgrade/
cp -a /etc/fstab     /root/backup-release-upgrade/
cp -a /etc/apt/      /root/backup-release-upgrade/

# Patch the current release first
apt update && apt upgrade -y && apt autoremove -y && apt clean
[ -f /var/run/reboot-required ] && reboot
```

###  <input type="checkbox"> 2. Rewrite `sources.list` to the new release

Replace the codename **everywhere** apt looks: the main `sources.list`, every `.list` file under `/etc/apt/sources.list.d/`, and (on Ubuntu 24.04+) the `.sources` files in the new DEB822 format.

Example for Ubuntu 20.04 (`focal`) → 22.04 (`jammy`):

```sh
# Replace the codename in every *.list file (handles both /etc/apt/sources.list and /etc/apt/sources.list.d/*.list)
find /etc/apt/ -type f -name "*.list" -print0 | xargs -0 sed -i 's/focal/jammy/g'

# Same idea for *.sources (DEB822 format, used since Ubuntu 24.04)
find /etc/apt/sources.list.d/ -type f -name "*.sources" -print0 2>/dev/null | xargs -0r sed -i 's/focal/jammy/g'
```

For Debian (e.g. `bullseye` → `bookworm`):

```sh
find /etc/apt/ -type f \( -name "*.list" -o -name "*.sources" \) -print0 | xargs -0 sed -i 's/bullseye/bookworm/g'
# Also remove security suffix differences if any: bullseye-security → bookworm-security is handled above.
```

> [!WARNING]
> Verify the result before continuing: `grep -r '<new-codename>' /etc/apt/`. If you still see the **old** codename somewhere, the upgrade will pull a mix of old and new packages.

###  <input type="checkbox"> 3. Drop incompatible third-party repos

If you have `cloud-archive` (Ubuntu cloud images) or other PPAs pinned to the old release that haven't been rebuilt for the new one, **remove them now** — they'll either 404 on `apt update` or pull broken dependencies.

```sh
# Common Ubuntu offender:
rm -v /etc/apt/sources.list.d/cloud-archive.list 2>/dev/null

# Inspect everything else: anything still pointing at the old codename or to a project that hasn't released for the new distro yet?
ls /etc/apt/sources.list.d/
```

Re-add them only **after** the upgrade, once the maintainer publishes a build for the new release.

###  <input type="checkbox"> 4. Refresh the index against the new repos

```sh
apt update
```

If this errors out (404 on a repo, signature mismatch...), don't proceed: fix the source first.

###  <input type="checkbox"> 5. Run the non-interactive distribution upgrade

The two key flags:

- `DEBIAN_FRONTEND=noninteractive` → tells dpkg no humans are watching.
- `Dpkg::Options::="--force-confold"` → on config conflicts, keep your customised version (the new default goes alongside as `*.dpkg-dist`).

```sh
export DEBIAN_FRONTEND=noninteractive
apt -o Dpkg::Options::="--force-confold" \
    -o Dpkg::Options::="--force-confdef" \
    dist-upgrade -y
```

`dist-upgrade` (vs `upgrade`) accepts **package removals and dependency changes**, which is exactly what a release upgrade requires.

###  <input type="checkbox"> 6. Cleanup, reboot, verify

```sh
apt autoremove --purge -y
apt clean
reboot

# After reboot:
lsb_release -a
uname -r
systemctl is-system-running
```

Then run the [post-upgrade checks](linux-post-upgrade-checks).


## C: redeploy from scratch

The pragmatic path when the infra is automated. 

Instead of mutating the live machine, you **provision a fresh VM on the target release** and migrate workload + data over.

This is the modern infra-as-code mindset: if something needs a major upgrade, you rebuild it. 

No half-old, half-new state ever exists.

You don't even need to shut down the old one in the meantime, **unless** the new one needs to use the same IP address or hostname. 

Unfortunately, many times its the case: internal config files, or even external ones of other VMs that target the current server).

### When this makes sense

- The server is **stateless** or its state lives elsewhere (database on a managed service, files on object storage, config in Git).
- You have **IaC** (MAAS, Terraform, Ansible, cloud-init...) that can reproduce the box from a single command.
- You can tolerate a short **cutover window** (DNS TTL, load balancer switch...).

### The general flow

1. **Provision** a new VM on the target release with your IaC tool:
   ```sh
   terraform apply  # or: ansible-playbook site.yml --limit new-host
   ```
2. **Run the role/playbook** that installs the application stack on the new VM (same one that built the old VM, just against the new image).
3. **Migrate the data**, if any: `rsync -av /srv/data/ new-host:/srv/data/`.
4. **Cut over**: switch the DNS record, the load balancer target, or the reverse-proxy backend to point at the new VM.
5. **Soak for 24-48h**, then **decommission** the old VM.

> [!IMPORTANT]
> Keep the old VM **powered off but not deleted** for at least a few days after cutover. If something subtle regresses, the old VM can be powered back on and DNS flipped back in minutes.


## After the upgrade

Whichever option you used, the system is on the new release... but you haven't *verified* anything yet. 

Walk through the full [post-upgrade checks](linux-post-upgrade-checks): kernel, services, application health, log review, and the all-important `diff` against the pre-upgrade system snapshot.

Instead, if something is broken and you can't make it work, the [upgrade rollback](linux-upgrade-rollback) page covers the recovery options.

