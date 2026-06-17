---
title: 📚 Playbooks
---
This section collects my Ansible **playbooks**. 

Each one can be run two ways: straight from the **CLI**, or through **AWX** (pulled from GitLab) for a production-grade, scalable setup. 

Below: how a playbook is laid out, and how to run it both ways.

***

## Project layout

Of course there are thousands project layouts, but here's the two general ones you can use.

### Option A: all-in-one (great for the CLI)

A single self-contained directory with the playbook **and** its inventory, group_vars and templates together:

```
my-playbook/
├── ansible.cfg
├── inventory.yml
├── group_vars/
│   └── <group>.yml
├── <playbook>.yml
└── templates/
    └── <something>.j2
```

Simple and portable: perfect for running from your laptop.

### Option B: Inventory/Playbook separated (AWX + GitLab)

Inventory and playbooks live in **different GitLab groups/repos**: far more scalable for a real environment.

**Playbook repo** (flat, dependencies at the **root**):
```
playbooks/<automation>/         # one repo per automation
├── <playbook>.yml
├── collections/requirements.yml   # external collections
├── roles/requirements.yml         # only if it uses external roles
└── templates/
```

**Inventory repo** (hosts + their variables):
```
inventories/<env>/
└── <type>/
    ├── <inventory>.yml             # hosts + groups
    └── group_vars/<group>.yml      # variables for that group
```

> [!IMPORTANT]
> `collections/requirements.yml` (and `roles/requirements.yml`) must sit at the **repo root**: AWX installs Galaxy deps only from there, never from subfolders.

Then for wiring everything together (credential, Projects, Inventory Source, Job Template) you can check out how to [[awx-gitlab-wiring|Connect AWX to GitLab]], it pairs with the [[my-awx-stack|AWX]] and [[gitlab-setup|GitLab]] guides.

***

## How to use it

Two ways to run a playbook: from the **command line**, or via **AWX** pulled from GitLab (the "real production" approach). Expand the one you need.

> [!EXAMPLE]- With Ansible CLI
> **One-time prerequisites on your control node**
> ```bash
> # Ansible itself + the collections the playbook uses
> sudo apt install -y ansible
> ansible-galaxy collection install <collection>          # e.g. community.general
> # or, if the repo ships one:
> ansible-galaxy collection install -r collections/requirements.yml
> ```
>
> **Dry-run first (always)**
> ```bash
> ansible-playbook <playbook>.yml --check --diff
> ```
> Shows what *would* change without applying. Always do this first on a new host — especially for anything touching SSH, PAM or the firewall — and read the diff before committing.
>
> **Apply the full playbook**
> ```bash
> ansible-playbook <playbook>.yml
> ```
>
> **Run only part of it (tags)**
> ```bash
> ansible-playbook <playbook>.yml --tags "<tagA>,<tagB>"
> ansible-playbook <playbook>.yml --skip-tags "<tag>"
> ```
>
> **Limit to specific hosts**
> ```bash
> ansible-playbook <playbook>.yml --limit "<host-or-group>"
> ```
>
> **Override a variable**
> ```bash
> ansible-playbook <playbook>.yml -e "<var>=<value>"
> ```

> [!EXAMPLE]- With Ansible AWX
> The playbook lives in GitLab and is pulled by an AWX **Project** — see [[awx-gitlab-wiring|Connect AWX to GitLab]] for the wiring. The CLI flags above map directly onto **Job Template** fields.
>
> **Set up the Job Template** — *Resources → Templates → Add → Job Template*:
> - **Project**: your playbook project · **Playbook**: `<path>/<playbook>.yml` *(dropdown; subfolders are listed too)*
> - **Inventory**: one that contains the group the playbook targets (`hosts: <group>`)
> - **Credentials**: the **Machine** credential for the targets
> - **Execution Environment**: leave **default** *(it's the runtime image, not a machine)*
> - **Instance Groups**: `execution-vms` *(the execution node — the machine that SSHes to the targets)*
>
> **Dry-run first (always)** — set **Job Type → Check** and enable **Show Changes** (= `--check --diff`). Launch once and read the diff before a real run.
>
> **Apply** — set **Job Type → Run** → **Launch**.
>
> **Run only part of it (tags)** — use the **Job Tags** / **Skip Tags** fields (tick *Prompt on launch* to choose per-run).
>
> **Limit to specific hosts** — the **Limit** field (same as `--limit`).
>
> **Override variables** — pass them in the Job Template's **Variables** (extra vars), or — nicer — expose them as a **Survey** (a field/checkbox per option):
> ```yaml
> <var>: <value>
> ```
>
> > [!WARNING] Execution Environment ≠ Execution Node
> > **EE** = the container *image* the job runs in → leave it **default**. **Execution Node** = the *machine* that runs the job and SSHes to the target → chosen via **Instance Groups**. Don't confuse the two (and don't pick "Control Plane Execution Environment").
>
> **Same cautions as the CLI**: dry-run on a new host first, and be careful with destructive/irreversible changes until you've verified the diff.