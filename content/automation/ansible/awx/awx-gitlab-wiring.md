---
title: "4. Connect AWX to Gitlab: store and run playbooks and inventories using Git"
tags:
---

This guide wires [[gitlab-setup|GitLab]] into [[my-awx-stack|AWX]] so that **inventories, playbooks, roles and collections** all live in versioned, reviewable Git reposI. 

Git becomes the single source of truth: AWX just mirrors it. 

***

## The model: one mechanism, two consumers

A **Project** in AWX = a Git repo, cloned and kept in sync — a **live link**, not a one-time import. The *same* Project mechanism feeds two things:

```mermaid
flowchart LR
    subgraph GL["🦊 GitLab"]
        PB["automation/playbooks<br/>site.yml + roles/ + collections/"]
        INV["inventories/prod<br/>openstack/openstack.yml + group_vars/"]
    end
    subgraph AWX["🎛️ AWX"]
        ProjPB["📚 Project (playbooks)"]
        ProjINV["📚 Project (inventories)"]
        Src["🔗 Inventory Source"]
        Inv["📋 Inventory"]
        JT["▶️ Job Template<br/>Project + Playbook + Inventory"]
    end
    Target["🖥️ target hosts"]
    PB -- "git clone" --> ProjPB
    INV -- "git clone" --> ProjINV
    ProjINV --> Src
    Src -- "sync = import" --> Inv
    ProjPB --> JT
    Inv --> JT
    JT -- "run via execution node" --> Target
```

- **Job Templates** pick a **playbook** from a Project ← the *primary* purpose of a Project.
- **Inventory Sources** pick an **inventory file** from a Project ← versions your hosts.
- **roles / collections** come in through `requirements.yml`, auto-installed on Project sync.

> [!INFO]
> A green **Sync Status: Success** on an inventory, or a Job Template that just *has* a playbook dropdown, both mean the same thing underneath: a **Project** (Git) behind it.

***

## 1. GitLab: the repos

Enterprise layout = **one repo per concern** (the `playbooks`, `roles`, `collections`, `inventories` split you'd see at work).

**Inventories** repo — `inventories/prod` (folder per machine type, inventory + `group_vars/` together):
```
inventories/prod
└── openstack/
    ├── openstack.yml
    └── group_vars/all.yml
```

**Playbooks** repo — `automation/playbooks`:
```
automation/playbooks
├── site.yml
├── roles/requirements.yml         # external roles (Galaxy or Git)
└── collections/requirements.yml   # external collections
```

`site.yml` (a minimal verify playbook):
```yaml
- name: Reach every host
  hosts: all
  gather_facts: false
  tasks:
    - name: ping
      ansible.builtin.ping:
```

`collections/requirements.yml`:
```yaml
collections:
  - name: community.general
```

> [!IMPORTANT]
> Keep `group_vars/` in the **same folder** as the inventory file — that's how Ansible (and AWX's import) auto-loads them.

***

## 2. GitLab: read-only SSH access (one credential, all repos)

AWX only needs to **clone**. Don't use HTTPS deploy *tokens* (per-repo, don't scale). Use a **read-only service account** with an SSH key, member of the groups → one credential clones every repo.

1. **Bot user**: Admin → **Users → New user** → `svc-awx`.
2. **Read access**: each group (`inventories`, `automation`) → **Manage → Members → Invite** → `svc-awx` → role **Reporter**.
3. **SSH key**:
   ```bash
   ssh-keygen -t ed25519 -f svc-awx -C svc-awx -N ""
   ```
   Admin → Users → `svc-awx` → **Impersonate** → **Preferences → SSH Keys** → paste `svc-awx.pub` → **Stop impersonation**.

> [!TIP]- Lighter alternative: an SSH deploy key (per-repo)
> Add the **public** key as a read-only **Deploy key** (Repo → Settings → Repository → Deploy keys, *Grant write permissions* OFF), and enable the same key on other repos. SSH too — just per-repo instead of group-wide.

***

## 3. AWX: Source Control credential (SSH) — shared

**Resources → Credentials → Add**
- **Credential Type**: `Source Control`
- **SCM Private Key**: the **private** `svc-awx` (whole block, incl. `-----BEGIN OPENSSH PRIVATE KEY-----`)
- Leave Username / Password / Passphrase **empty** (the user comes from the `git@` URL).

***

## 4. AWX: one Project per repo

Create a Project for **each** repo — same steps, different URL. **Resources → Projects → Add**:

| Field | Playbooks | Inventories |
|---|---|---|
| Name | `Playbooks` | `Inventories` |
| Source Control Type | Git | Git |
| Source Control URL | `git@gitlab.yourdomain.com:automation/playbooks.git` | `git@gitlab.yourdomain.com:inventories/prod.git` |
| Source Control Credential | `svc-awx` | `svc-awx` |
| Options | ✅ Update Revision on Launch | ✅ Update Revision on Launch |

**Save** each → wait for **Successful**. Copy the exact SSH URL from the repo's **Code → Clone with SSH**.

> [!NOTE]
> On sync, AWX also runs `ansible-galaxy install` for any `roles/requirements.yml` and `collections/requirements.yml` in the Project → your roles & collections arrive from Git automatically. (Public Galaxy works out of the box; private Git/registry sources need extra credential setup.)

***

## 5. Path A — Playbooks → Job Template

This is the main use of a Project.

**Resources → Templates → Add → Job Template**:

| Field | Value |
|---|---|
| Name | `site` |
| Job Type | Run |
| **Inventory** | `OpenStack` (from Path B) |
| **Project** | `Playbooks` |
| **Playbook** | `site.yml` *(dropdown — auto-detected)* |
| **Credentials** | the **Machine** credential for the targets |
| **Instance Groups** | `execution-vms` *(run on the execution node)* |

**Save → Launch**. AWX runs the playbook **straight from the cloned repo**.

> [!NOTE]
> The **Playbook** dropdown auto-lists files AWX recognises as playbooks — no manual path needed (unlike the inventory-file case below).

***

## 6. Path B — Inventories → Inventory + Source

**Resources → Inventories → Add → Inventory** → Name `OpenStack` → **Save** *(empty container — nothing connects to Git here)*.

Open it → **Sources** tab (appears only after saving) → **Add**:

| Field | Value |
|---|---|
| Source | **Sourced from a Project** |
| Project | `Inventories` |
| Inventory file | `openstack/openstack.yml` |
| Options | ✅ Update on launch · ✅ Overwrite · ✅ Overwrite variables |

**Save → Sync**.

> [!BUG]- The "Inventory file" dropdown only shows `/ (project root)`
> AWX auto-lists inventory files at the **repo root**; files in **subfolders** often aren't suggested. (1) **Re-sync the Project** so AWX has the committed file. (2) The field is **typeable** — just type `openstack/openstack.yml` (path relative to repo root). Saved on the Source, one-time.

> [!NOTE]- "My `group_vars/all.yml` var isn't on the host!"
> Correct — the host page shows **host vars only**. `group_vars/all.yml` are **group vars** (the `all` scope): AWX imports them as **inventory-level variables** (Inventory → Edit → Variables), and merges them onto every host at runtime.

***

## 7. Verify end-to-end

Targets need: a **Machine credential** (SSH key whose public half is in the target's `~/.ssh/authorized_keys`), the target allowing `:22` **from the execution node's IP**, and the Inventory's **Instance Groups = `execution-vms`**.

Then either:
- **Launch the `site` Job Template** (Path A) → green play recap, or
- **Ad-hoc**: Inventory → Hosts → select → **Run Command** → module `ping`.

Success looks like:
```
host | SUCCESS => { "ping": "pong" }
```
The job's **Execution Node** = your node, confirming it ran over the mesh.

***

## The Project is a live link (don't delete it)

Deleting a Project does **not** wipe already-imported inventory hosts (they're copied into AWX's DB), so it *looks* like things still work. But you've cut the live link: inventories stop syncing, **Job Templates lose their playbook**, and with *Update on launch* the next launch **fails** trying to sync. A Project is the engine that keeps AWX mirrored to Git — not a one-shot import.

***

## Scaling out

Git stays the single source of truth; AWX mirrors it:
- **playbooks** repo → Project → many **Job Templates**
- **inventories** repo → Project → many **Inventory Sources** (one per type: `openstack/`, `vmware/`, …)
- **roles / collections** → `requirements.yml`, auto-installed on sync
- one `svc-awx` SSH credential reads them all