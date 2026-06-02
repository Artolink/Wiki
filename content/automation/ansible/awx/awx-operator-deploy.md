---
title: "AWX Operator: deploy the control plane on Kubernetes"
tags:
---

This page installs the **AWX Operator** on the Kubernetes cluster and brings up the **first AWX instance**. It's the PoC rung of the series: managed PostgreSQL pod, default on-cluster Execution Environment, access via port-forward. The external database, dedicated execution nodes, and custom EE images come in the following pages.

See [[my-awx-stack|the stack overview]] for the architecture and the reasoning behind every choice here.

***

## Prerequisites

| Requirement | Notes |
|---|---|
| A running Kubernetes cluster | The Aruba KaaS from [[my-awx-stack]]: 3 worker nodes (4 vCPU / 8 GB), Node CIDR `10.20.0.0/24`, Pod CIDR `10.244.0.0/16` |
| `kubectl` ≥ 1.27 on your workstation | The CLI that talks to the cluster |
| The cluster **kubeconfig** | Downloaded from the Aruba panel (Networking / cluster details) |
| Your public IP in the **API allowlist** | Set during cluster creation; the API rejects everything else |
| A default **StorageClass** | The managed PostgreSQL needs a PVC — verified in Step 1 |

***

## Step 1 — Connect kubectl to the cluster

Download the kubeconfig from the Aruba panel and point `kubectl` at it:

```bash
mkdir -p ~/.kube
# Move the downloaded file into place
mv ~/Downloads/kubeconfig-awx.yaml ~/.kube/aruba-awx.yaml
export KUBECONFIG=~/.kube/aruba-awx.yaml

# Verify: the 3 worker nodes should be Ready
kubectl get nodes
```

Expected:

```
NAME                STATUS   ROLES    AGE   VERSION
awx-kaas-nodes-1    Ready    <none>   5m    v1.30.x
awx-kaas-nodes-2    Ready    <none>   5m    v1.30.x
awx-kaas-nodes-3    Ready    <none>   5m    v1.30.x
```

> [!WARNING]
> If `kubectl get nodes` hangs and times out, your **current public IP is not in the API allowlist** you set at cluster creation. Two fixes:
> - Add your current IP in the Aruba panel (`curl -4 ifconfig.me` to find it), or
> - Run `kubectl` from your **VPS** instead — its static IP is already in the allowlist, so it's the path that never locks you out.

Confirm there's a default StorageClass (the managed PostgreSQL PVC depends on it):

```bash
kubectl get storageclass
# One of them must be marked (default). On Aruba KaaS it's the block-storage CSI class.
```

> [!IMPORTANT]
> If no StorageClass is marked `(default)`, the managed PostgreSQL PVC will stay `Pending` forever and AWX never starts. Mark one as default:
> ```bash
> kubectl patch storageclass <name> -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
> ```

***

## Step 2 — Install the AWX Operator

The operator is deployed with **kustomize** (bundled into `kubectl` as `apply -k`). Pin a specific release rather than tracking `latest` — pick the newest tag from the [awx-operator releases](https://github.com/ansible/awx-operator/releases).

Create a working directory with a `kustomization.yaml`:

```bash
mkdir -p ~/awx-deploy && cd ~/awx-deploy
```

`~/awx-deploy/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - github.com/ansible/awx-operator/config/default?ref=2.19.1

# Pin the operator image to the same release tag
images:
  - name: quay.io/ansible/awx-operator
    newTag: 2.19.1

# Everything lands in a dedicated namespace
namespace: awx
```

Apply it:

```bash
kubectl apply -k .
```

Wait for the operator pod to be Running:

```bash
kubectl get pods -n awx -w
# awx-operator-controller-manager-xxxxx   2/2   Running
```

> [!INFO]
> The operator is now watching the `awx` namespace for `AWX` custom resources. It does nothing yet — it's the controller that will build the actual deployment when you declare an instance in the next step.

***

## Step 3 — Deploy the first AWX instance

You declare *what you want* with an `AWX` custom resource; the operator reconciles the cluster to match. For the PoC we keep it minimal: managed PostgreSQL (the operator creates it automatically when no external DB is configured), default EE, internal service only.

`~/awx-deploy/awx-instance.yaml`:

```yaml
apiVersion: awx.ansible.com/v1beta1
kind: AWX
metadata:
  name: awx
  namespace: awx
spec:
  # ClusterIP = internal only. We reach the UI via port-forward for the PoC.
  # Production exposure (LoadBalancer / Ingress + TLS) comes later.
  service_type: ClusterIP
```

Add it to the kustomization so it's managed together:

```yaml
# append to resources: in ~/awx-deploy/kustomization.yaml
resources:
  - github.com/ansible/awx-operator/config/default?ref=2.19.1
  - awx-instance.yaml
```

Re-apply:

```bash
kubectl apply -k .
```

The operator now spins up the full control plane. Watch it converge (takes a few minutes — it pulls images, runs DB migrations, starts the services):

```bash
kubectl get pods -n awx -w
```

Expected end state:

```
awx-operator-controller-manager-xxxxx   2/2   Running
awx-postgres-13-0                        1/1   Running   # managed DB (PoC only)
awx-xxxxxxxxxx-xxxxx                      4/4   Running   # web + task + ee + redis
```

> [!TIP]
> If a pod is stuck in `Pending`, it's almost always the PVC: `kubectl get pvc -n awx` and `kubectl describe pod -n awx <pod>`. A `Pending` PVC means the StorageClass issue from Step 1.

***

## Step 4 — Get the admin password and open the UI

The operator generates a random admin password into a secret:

```bash
kubectl get secret awx-admin-password -n awx \
  -o jsonpath="{.data.password}" | base64 --decode ; echo
```

Copy it to your password manager ([[bitwarden-setup|Bitwarden]] / [[keepass-setup|KeePass]]) now.

Access the UI via port-forward (no public exposure — perfect for the PoC):

```bash
kubectl port-forward -n awx svc/awx-service 8080:80
```

Open `http://localhost:8080` and log in as `admin` + the password above.

***

## Step 5 — Verify end-to-end

A fresh AWX ships with a **Demo Project**, **Demo Inventory** (localhost), and **Demo Job Template**. Running it confirms the whole execution path works — including the default on-cluster EE.

1. In the UI: **Resources → Templates → Demo Job Template → Launch**.
2. The job should run and finish **Successful**, with green output streaming live.

If that job goes green, your control plane is fully functional: the web layer launched it, the task layer scheduled it, and the default EE executed it. That's the PoC done.

***

## Production exposure (preview)

`kubectl port-forward` is fine for the PoC but it's a tunnel from your laptop. For real access you'll expose `awx-service` properly:

- **LoadBalancer** service (if the Aruba KaaS provisions one with a public IP), or
- **Ingress** (nginx-ingress controller) + a TLS cert from cert-manager.

That, plus secrets management and backups, is the production-exposure work. For now the port-forward keeps AWX completely private while you build out the rest of the stack.

***

## Where to go next

- [[awx-external-postgres|External PostgreSQL]] — replace the managed DB pod with a real external database before you put anything you care about into AWX. *(next in this series)*
- [[awx-execution-nodes|Execution nodes]] — join dedicated workers over the Receptor mesh and cross into pattern A. *(TBD)*
- [[awx-custom-ee|Custom Execution Environments]] — build your own EE with `ansible-builder`, hosted on the [[gitlab-setup|GitLab Registry]]. *(TBD)*