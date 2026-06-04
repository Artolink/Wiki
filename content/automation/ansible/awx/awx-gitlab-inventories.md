---
title: "AWX inventories from GitLab: Git as the source of truth"
tags:
---

This page wires **Git-hosted Ansible inventories** into AWX, so your hosts, groups and variables live in a versioned, reviewable repo instead of being typed into the UI. It's the **"Pro" path** from [[awx-execution-nodes#2. Inventory: the target host|the execution-nodes guide]].

Built on top of the self-hosted [[gitlab-setup|GitLab]].

***

## The model: two layers

AWX does **not** read GitLab as an inventory directly. Two objects work together:

```mermaid
flowchart LR
    subgraph GL["🦊 GitLab"]
        Repo["inventories/prod repo<br/>openstack/openstack.yml<br/>+ group_vars/"]
    end
    subgraph AWX["🎛️ AWX"]
        Proj["📚 Project<br/>(clones the repo, SSH read-only)"]
        Src["🔗 Inventory Source<br/>'Sourced from a Project'<br/>file: openstack/openstack.yml"]
        Inv["📋 Inventory<br/>(hosts + groups + vars)"]
    end
    Target["🖥️ target host"]
    Repo -- "git clone" --> Proj
    Proj --> Src
    Src -- "sync = parse + import" --> Inv
    Inv -- "job via execution node" --> Target
```

- **Project** = the Git repo, cloned by AWX. Just plumbing — it doesn't appear under *Inventories*.
- **Inventory** = the actual inventory object, populated by an **Inventory Source** of type *Sourced from a Project* that points at a file inside the Project.

> [!INFO]
> In the AWX *Inventories* list, a green **Sync Status: Success** badge means exactly this: that inventory is sourced from a Project (Git). There's always a Project behind it.

***

## 1. GitLab: the inventory repo

Mirror the enterprise layout: a group `inventories`, a repo per environment, and **a folder per machine type** with the inventory file + its `group_vars/` alongside.

```
inventories/                 ← GitLab group
└── prod                     ← repo (one per environment)
    └── openstack/           ← folder per machine type
        ├── openstack.yml    ← the inventory
        └── group_vars/
            └── all.yml
```

`openstack/openstack.yml`:
```yaml
all:
  children:
    compute:
      hosts:
        nova01:
          ansible_host: 10.20.0.11
```

`openstack/group_vars/all.yml`:
```yaml
# applied to every host in this inventory
ansible_python_interpreter: auto_silent
```

> [!IMPORTANT]
> Keep `group_vars/` in the **same folder** as the inventory file. That's how Ansible (and AWX's import) auto-loads them.

***

## 2. GitLab: read-only access for AWX (SSH, not deploy tokens)

AWX only needs to **clone**. The enterprise pattern for a whole group of inventory repos is a **read-only service account** with an SSH key — **one credential clones every repo in the group**.

1. **Create a bot user**: Admin → **Users → New user** → `svc-awx`.
2. **Give it read access to the group**: group `inventories` → **Manage → Members → Invite** → `svc-awx` → role **Reporter**.
3. **Add its SSH key**:
   ```bash
   ssh-keygen -t ed25519 -f svc-awx -C svc-awx -N ""
   ```
   Admin → Users → `svc-awx` → **Impersonate** → **Preferences → SSH Keys** → paste `svc-awx.pub` → **Stop impersonation**.

> [!TIP]- Lighter alternative: an SSH deploy key (per-repo)
> If you don't want a bot user, add the **public** key as a read-only **Deploy key** (Repo → Settings → Repository → Deploy keys, *Grant write permissions* OFF). Enable the same key on other repos from their Deploy keys page. It's SSH too — just per-repo instead of group-wide. Avoid HTTPS **deploy *tokens*** for a multi-repo setup: they don't scale to a whole group.

***

## 3. AWX: Source Control credential

**Resources → Credentials → Add**
- **Credential Type**: `Source Control`
- **SCM Private Key**: paste the **private** `svc-awx` (the whole block, including `-----BEGIN OPENSSH PRIVATE KEY-----`)
- Leave **Username / Password / Passphrase empty** (SSH key, no passphrase; the user comes from the `git@` URL).

***

## 4. AWX: Project (the repo)

**Resources → Projects → Add**

| Field | Value |
|---|---|
| Name | `Inventories` |
| Source Control Type | **Git** |
| Source Control URL | `git@gitlab.yourdomain.com:inventories/prod.git` |
| Source Control Credential | the one from step 3 |
| Options | ✅ **Update Revision on Launch** |

**Save** → a sync runs → wait for **Successful**. Grab the exact SSH URL from the repo's **Code → Clone with SSH** to avoid typos.

> [!NOTE]
> Git over SSH hits port **22** of the GitLab host (published by the container). AWX reaches it on the public IP. If the first sync says *"Host key verification failed"*, it's `known_hosts` — usually the EE doesn't strict-check and it works.

***

## 5. AWX: Inventory + Source

**Resources → Inventories → Add → Inventory** → Name `OpenStack`, Organization `Default` → **Save**. *(This just creates the empty container — nothing connects to Git here.)*

Open it → the **Sources** tab now appears (it only shows after saving) → **Add**:

| Field | Value |
|---|---|
| Source | **Sourced from a Project** |
| Project | `Inventories` (step 4) |
| Inventory file | `openstack/openstack.yml` |
| Options | ✅ Update on launch · ✅ Overwrite · ✅ Overwrite variables |

**Save → Sync**.

> [!BUG]- The "Inventory file" dropdown only shows `/ (project root)`
> AWX auto-lists inventory files at the **repo root**; files in **subfolders** (`openstack/openstack.yml`) often aren't suggested. Two things:
> 1. **Re-sync the Project** first (Projects → Sync) so AWX has the committed file — the dropdown is empty mostly because the Project was synced *before* the file existed.
> 2. The field is **typeable**: just type the path `openstack/openstack.yml` (relative to repo root, subfolder included). It's saved on the Source — a one-time thing, you never retype it.

| Option | What it does |
|---|---|
| **Update on launch** | re-clone + re-import before every job → always current |
| **Overwrite** | hosts/groups deleted in Git are removed from AWX |
| **Overwrite variables** | vars removed in Git are removed from AWX (Git = source of truth) |

***

## 6. Verify

**a) The import worked** — Inventory → **Hosts**: the host from the file appears, with its `ansible_host`.

> [!NOTE]- "My `group_vars/all.yml` variable isn't on the host!"
> Correct — the host page shows **host vars only**. Variables from `group_vars/all.yml` are **group vars** (the `all` scope): AWX imports them as **inventory-level variables**, not onto each host. Check **Inventory → Edit → Variables** — you'll find them there. At runtime Ansible merges `all` → host, so the host still gets them.

**b) Reach the host** — run a ping through the execution node (the [[awx-execution-nodes#7. Run a real job against a target host|Step 7]] pattern):

1. **Machine credential**: Resources → Credentials → Add → type **Machine** → Username + SSH private key (its **public** key in the target's `~/.ssh/authorized_keys`).
2. **Target prep**: authorize the key, and allow `:22` **from the execution node's IP** (the SSH leaves from the node, not the control plane).
3. **Route via the node**: Inventory → Edit → **Instance Groups** → `execution-vms`.
4. **Ad-hoc ping**: Inventory → **Hosts** → select the host → **Run Command** → module `ping` → the Machine credential → **Launch**.

Green output with `"ping": "pong"` = the execution node SSHed to the target and ran it. No playbook/Project needed for an ad-hoc command.

***

## Scaling out

Same Project (the repo) can feed **many** inventories: add one **Source per type** (`openstack/openstack.yml`, `vmware/vmware.yml`, …), or one repo per environment with the `svc-awx` account reading the whole `inventories` group. Git stays the single source of truth; AWX just mirrors it.