---
title: 🎛️ Ansible AWX
series:
  - automation/ansible/awx/my-awx-stack
  - automation/ansible/awx/awx-operator-deploy
  - automation/ansible/awx/awx-execution-nodes
---

**AWX** is the open-source community project of **Ansible Automation Platform** (the commercial product, formerly "Ansible Tower").

It wraps `ansible-playbook` in a managed service:

- **Web UI + REST API** to launch, schedule, and monitor jobs.
- **RBAC**: organizations, teams, roles: who can run what, against which inventory, with which credentials.
- **Credential vaulting**: SSH keys, cloud secrets, vault passwords stored encrypted, injected at runtime, never exposed to the user.
- **Inventories**: static or dynamically sourced.
- **Audit trail**: every job, every change, who ran it, full stdout retained.

If you've been running playbooks by hand, AWX is the step that turns "a script I run from my laptop" into "a controlled service my whole team uses".

This series builds a **production-grade AWX** the way it's actually run at scale: 

- The AWX Operator on Kubernetes
- An external HA database (*to be added in the future*)
- Dedicated execution nodes joined over a Receptor mesh
- Custom Execution Environments built in CI (*to be added in the future*)

Start from the overview for the architecture, then follow the deploy pages in order.