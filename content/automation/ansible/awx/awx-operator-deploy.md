---
title: "AWX Operator: deploy the control plane on Kubernetes"
tags:
---
This page installs the **AWX Operator** on the Kubernetes cluster and brings up the **first AWX instance**.

It's the "Lab" level of the series: an **in-cluster PostgreSQL**, the **default on-cluster Execution Environment**, and access via **port-forward**. The dedicated execution nodes and custom EE images come in the following pages. The one production-grade simplification we make here is the database — in a real deployment PostgreSQL lives on a dedicated external host (see the note at the end).

See [[my-awx-stack|the stack overview]] for the architecture and the reasoning behind every choice.

***

## Prerequisites

| Requirement                                                                                               | Notes                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A running Kubernetes cluster                                                                              | 3 worker nodes (4 vCPU / 8 GB). I used Node CIDR `10.20.0.0/24`, Pod CIDR `10.244.0.0/16` |
| `kubectl` ≥ 1.27 on your workstation (I run it in [[WSL-installation\|WSL]]) + the cluster **kubeconfig** | The CLI that talks to the cluster                                                         |
| Your public IP in the cluster **API allowlist**                                                           | If the KaaS restricts API access by IP, your address must be authorized                   |
| A default **StorageClass**                                                                                | Our in-cluster PostgreSQL needs a PVC                                                     |

***

## 1. Connect to your KaaS / K8s using kubectl

Since I use a KaaS, I downloaded its kubeconfig and pointed `kubectl` at it:

```bash
mkdir -p ~/.kube
mv ~/Downloads/kubeconfig-awx.yaml ~/.kube/kubeconfig-awx.yaml
export KUBECONFIG=~/.kube/kubeconfig-awx.yaml

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

Confirm there's a default StorageClass (our PostgreSQL PVC depends on it):

```bash
kubectl get storageclass
# One of them must be marked (default)
```

> [!IMPORTANT]
> If no StorageClass is marked `(default)`, the PostgreSQL PVC stays `Pending` forever and AWX never starts. Mark one as default:
> ```bash
> kubectl patch storageclass <name> -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
> ```

***

## 2. Install the AWX Operator

The operator is deployed with **kustomize** (bundled into `kubectl` as `apply -k`). Pin a specific release rather than tracking `latest`: pick the newest tag from the [awx-operator releases](https://github.com/ansible/awx-operator/releases).

Create a working directory:

```bash
mkdir -p ~/awx-deploy && cd ~/awx-deploy
```

`~/awx-deploy/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: awx

resources:
  - github.com/ansible/awx-operator/config/default?ref=2.19.1

images:
  # Pin the operator image to the release tag
  - name: quay.io/ansible/awx-operator
    newTag: 2.19.1
  # Redirect the kube-rbac-proxy from the decommissioned gcr.io registry
  # to the upstream maintainer's repo on Quay (see callout below)
  - name: gcr.io/kubebuilder/kube-rbac-proxy
    newName: quay.io/brancz/kube-rbac-proxy
    newTag: v0.15.0
```

> [!WARNING]- The `kube-rbac-proxy` image override is mandatory on awx-operator 2.19.x 
> The operator pod has two containers; one of them references `gcr.io/kubebuilder/kube-rbac-proxy:v0.15.0`, but Google **decommissioned the `gcr.io/kubebuilder` registry**: without the override the operator pod gets stuck at `1/2 Running` with `ImagePullBackOff` and `not found`.
> 
 The redirect to `quay.io/brancz/kube-rbac-proxy` (the maintainer's repo) fixes it.

Validate the kustomization before applying (catches YAML typos before they touch the cluster):

```bash
kubectl kustomize ~/awx-deploy > /dev/null && echo "✅ YAML OK"
```

Apply it:

```bash
kubectl apply -k .
kubectl get pods -n awx -w
# awx-operator-controller-manager-xxxxx   2/2   Running
```

> [!INFO]
> The operator is now watching the `awx` namespace for `AWX` custom resources. 
> 
> It does nothing yet: it's the controller that will build the deployment when you declare an instance.

***

## 3. Deploy PostgreSQL in the cluster

> [!NOTE] For production: move the database out
> The in-cluster PostgreSQL is my only one lab shortcut. 
> 
> In production you'd run a **dedicated external PostgreSQL** (private-network VM or managed DB) so it survives cluster rebuilds with its own backups and HA. 
> 
> Same wiring: keep `postgres_configuration_secret`, just point `host:` elsewhere.

Generate a password and apply the database manifest in one shot:

```bash
PGPW=$(openssl rand -hex 24)
echo "Postgres password (save it): $PGPW"

cat > ~/awx-deploy/awx-db.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: awx-postgres-configuration
  namespace: awx
stringData:
  host: awx-db
  port: "5432"
  database: awx
  username: awx
  password: "$PGPW"
  sslmode: prefer
  type: unmanaged
type: Opaque
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: awx-db-data
  namespace: awx
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 8Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: awx-db
  namespace: awx
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: awx-db
  template:
    metadata:
      labels:
        app: awx-db
    spec:
      containers:
        - name: postgres
          image: postgres:15
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: awx-postgres-configuration
                  key: username
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: awx-postgres-configuration
                  key: password
            - name: POSTGRES_DB
              valueFrom:
                secretKeyRef:
                  name: awx-postgres-configuration
                  key: database
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: awx-db-data
---
apiVersion: v1
kind: Service
metadata:
  name: awx-db
  namespace: awx
spec:
  selector:
    app: awx-db
  ports:
    - port: 5432
      targetPort: 5432
EOF

kubectl apply -f ~/awx-deploy/awx-db.yaml
```

Three details that make this work:

- **`host: awx-db`**: the Service name, resolved by the cluster's internal DNS. AWX reaches the DB there.
- **One secret for both**: `awx-postgres-configuration` is read by PostgreSQL (to create the `awx` user/db on first boot) *and* by AWX (to connect). No chance of mismatched passwords.
- **`PGDATA=/var/lib/postgresql/data/pgdata`**: a *subdirectory* of the mount. Required: block-storage volumes have a `lost+found` at the root, and `initdb` refuses a non-empty directory.

Verify the database is up:

```bash
kubectl get pods -n awx -l app=awx-db -w
# wait for Running, then:
kubectl logs -n awx deploy/awx-db | tail -5
# expected: "database system is ready to accept connections"
```

***

## 4. Deploy the AWX instance

You declare *what you want* with an `AWX` custom resource: the operator reconciles the cluster to match. 

We point it at the database secret from Step 3 (`postgres_configuration_secret`), and keep the service internal.

`~/awx-deploy/awx-instance.yaml`:

```yaml
apiVersion: awx.ansible.com/v1beta1
kind: AWX
metadata:
  name: awx
  namespace: awx
spec:
  # ClusterIP = internal only. We reach the UI via port-forward for the Lab.
  # Production exposure (LoadBalancer / Ingress + TLS) comes later.
  service_type: ClusterIP
  # Use the in-cluster PostgreSQL from Step 3 instead of a managed pod
  postgres_configuration_secret: awx-postgres-configuration
```

Add it to the kustomization:

```yaml
# append to resources: in ~/awx-deploy/kustomization.yaml
resources:
  - github.com/ansible/awx-operator/config/default?ref=2.19.1
  - awx-instance.yaml
```

Re-apply and watch the control plane converge (a few minutes, it pulls images, runs DB migrations, starts the services):

```bash
kubectl apply -k .
kubectl get pods -n awx -w
```

Expected end state:

```
awx-db-xxxxxxxxxx-xxxxx                  1/1   Running     # our PostgreSQL
awx-operator-controller-manager-xxxxx    2/2   Running
awx-web-xxxxxxxxxx-xxxxx                  3/3   Running     # web
awx-task-xxxxxxxxxx-xxxxx                 4/4   Running     # task + ee + redis
awx-migration-24.6.1-xxxxx               0/1   Completed   # DB schema migrations
```

> [!TIP]
> The `awx-migration-*` job running is the signal that **AWX connected to the database successfully**: migrations only run once the connection works. If it appears, your external-DB wiring is correct.

***

## 5. Get the admin password and open the UI

The operator generates a random admin password into a secret:

```bash
kubectl get secret awx-admin-password -n awx \
  -o jsonpath="{.data.password}" | base64 --decode ; echo
```

Copy it to your password manager ([[bitwarden-setup|Bitwarden]] / [[keepass-setup|KeePass]]) now.

Access the UI via port-forward: since `kubectl` runs in WSL in my case, it tunnels straight to the Windows browser on `localhost`:

```bash
kubectl port-forward -n awx svc/awx-service 8080:80
```

(if the service isn't named `awx-service`, find it with `kubectl get svc -n awx`)

Open `http://localhost:8080` and log in as `admin` + the password above.

***

## 6. Verify end-to-end

A fresh AWX ships with a **Demo Project**, **Demo Inventory** (localhost), and **Demo Job Template**. 

Running it confirms the whole execution path works, including the default on-cluster EE.

1. In the UI: **Resources → Templates → Demo Job Template → Launch**.
2. The job should run and finish **Successful**, with green output streaming live.

If that job goes green, your control plane is fully functional: the web layer launched it, the task layer scheduled it, the default EE executed it, and PostgreSQL recorded it. 

That's the Lab done.

***

## Where to go next

- [[awx-execution-nodes|Execution nodes]]: join dedicated workers over the Receptor mesh and cross into pattern A. *(next in this series)*
- **Production: external PostgreSQL**: when your environment allows a dedicated database host, move the DB out of the cluster, it is better for production. 