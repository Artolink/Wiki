Procedura operativa per rinnovare i certificati scaduti dei nodi control-plane di
un cluster Kubernetes installato con kubespray, con etcd esterno gestito
separatamente.

**Cosa NON copre: rinnovo CA (scadenza 10 anni) e certificati ETCD esterni.**

## Contesto

- **Cluster**: kubespray, 3 master control-plane
- **etcd**: esterno (nodi dedicati), certificati in `/etc/ssl/etcd/ssl/`
  gestiti fuori da `kubeadm` — NON vengono toccati da questa procedura
- **LB apiserver**: hostname del load balancer davanti agli apiserver
  (es. `<lb-apiserver-fqdn>:6443`)
- **Sintomo tipico**:
  `x509: certificate has expired or is not yet valid`

## Principi

1. **Un master alla volta**, serialmente. Mai in parallelo.
2. Dopo ogni master, verifica che l'apiserver sia UP prima di passare al successivo.
3. L'etcd esterno non va toccato: `kubeadm certs renew` mostrerà i cert etcd come
   `MISSING!` ed è **normale**.
4. Il `kubeconfig` locale (`~/.kube/config`) contiene un client cert che va
   anch'esso rigenerato da `admin.conf`.

## Prerequisiti

- Accesso SSH root ai 3 master
- Spazio per backup di `/etc/kubernetes` (qualche MB)
- Finestra di manutenzione: durante il restart dei static pod su un master,
  quel master non serve traffico. Con LB in round-robin alcune richieste
  `kubectl` possono fallire finché non hai aggiornato tutti e 3.

## Procedura per singolo master

Ripeti identica su ciascun master, uno alla volta.

### 1. Verifica stato certificati

```bash
sudo kubeadm certs check-expiration
```

Atteso: certificati control-plane in scadenza/scaduti. I campi `etcd-*` come
`MISSING!` sono normali (etcd esterno).

### 2. Backup

```bash
sudo cp -r /etc/kubernetes /etc/kubernetes.bak-$(date +%Y%m%d-%H%M)
```

### 3. Rinnovo

```bash
sudo kubeadm certs renew all
```

Rinnova:
- `apiserver`
- `apiserver-kubelet-client`
- `front-proxy-client`
- `admin.conf`, `controller-manager.conf`, `scheduler.conf`, `super-admin.conf`

Messaggi `MISSING! certificate ... etcd` → ignorabili (etcd esterno).

Il warning `Error reading configuration from the Cluster. Falling back to default
configuration` è atteso quando l'apiserver è già down per cert scaduti: kubeadm
usa la configurazione di default. **Va comunque verificato l'SAN** (step 5).

### 4. Restart dei static pod

Il kubelet non ricarica i certificati per i pod statici finché i container non
vengono ricreati.

**Metodo preferito (mv manifest):**

```bash
sudo mv /etc/kubernetes/manifests /etc/kubernetes/manifests.tmp
sleep 25
# Verifica che i container siano spariti
sudo crictl ps | grep -E 'kube-apiserver|kube-controller-manager|kube-scheduler'
# Rimetti a posto
sudo mv /etc/kubernetes/manifests.tmp /etc/kubernetes/manifests
sleep 25
# Verifica che siano tornati UP con età di pochi secondi
sudo crictl ps | grep -E 'kube-apiserver|kube-controller-manager|kube-scheduler'
```

**ATTENZIONE**: se dimentichi di rimettere a posto la cartella, l'apiserver
**non ripartirà**. Verifica sempre che `/etc/kubernetes/manifests` contenga i 3
yaml (`kube-apiserver.yaml`, `kube-controller-manager.yaml`,
`kube-scheduler.yaml`) al termine.

**Metodo alternativo (crictl stop):**

```bash
sudo crictl ps | grep -E 'kube-apiserver|kube-controller-manager|kube-scheduler'
# Copia gli ID dei 3 container
sudo crictl stop <ID_apiserver> <ID_cm> <ID_scheduler>
sleep 25
sudo crictl ps | grep -E 'kube-apiserver|kube-controller-manager|kube-scheduler'
```

Il kubelet ricrea automaticamente i static pod leggendo i nuovi cert.

### 5. Verifica SAN del cert apiserver

Critico quando c'è un LB davanti agli apiserver. Il cert DEVE contenere
l'hostname del LB.

```bash
sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -text \
  | grep -A2 "Subject Alternative Name"
```

Deve includere:
- l'hostname/FQDN del LB apiserver
- tutti gli hostname dei master (short + FQDN)
- `kubernetes`, `kubernetes.default`, `kubernetes.default.svc`,
  `kubernetes.default.svc.cluster.local`
- IP dei master + IP del LB + `127.0.0.1` + ClusterIP del service `kubernetes`
  (tipicamente `.1` della service CIDR, es. `10.96.0.1`)

Se un SAN manca, vedi sezione "Fix SAN mancanti" in fondo.

### 6. Aggiorna kubeconfig

```bash
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

Se l'utente target non è root, sostituisci `~/.kube/config` con il path giusto
(es. `/home/<utente>/.kube/config`) e adegua il `chown`.

### 7. Verifica

```bash
kubectl get nodes
```

Se `kubectl` va sul LB e l'LB instrada su un master non ancora aggiornato, puoi
ottenere errori `credentials` o `x509`. Bypass temporaneo puntando direttamente
al master corrente:

```bash
kubectl --server=https://<IP_master_corrente>:6443 get nodes
```

Solo per verifica; il kubeconfig resta quello che punta al LB.

### 8. Verifica scadenze

```bash
sudo kubeadm certs check-expiration
```

Tutti i cert control-plane devono ora avere ~1 anno di validità residua.

## Troubleshooting

### `the server has asked for the client to provide credentials`

Il server risponde (TLS ok), ma il tuo `~/.kube/config` ha ancora un client
cert scaduto. Ripeti lo step 6 su quel master, oppure verifica che
`~/.kube/config` sia stato effettivamente sovrascritto con il nuovo
`admin.conf`.

### `x509: certificate has expired` su altri master

Normale finché non hai rinnovato anche gli altri. Il round-robin del LB ti manda
su master ancora scaduti. Procedi col master successivo.

### Apiserver non riparte dopo il restart

Controlla:
```bash
sudo ls /etc/kubernetes/manifests/
```
Devono esserci i 3 file yaml. Se manca qualcosa, rimetti a posto dal `manifests.tmp`
o dal backup.

Log del kubelet:
```bash
sudo journalctl -u kubelet -n 100 --no-pager
```

Log dell'apiserver (se il container esiste ma è in crash):
```bash
sudo crictl ps -a | grep kube-apiserver
sudo crictl logs <container_id>
```

### SAN mancanti dopo il rinnovo

Se `kubeadm` non è riuscito a leggere il ConfigMap `kubeadm-config` e ha usato la
default config, potrebbe non aver incluso gli SAN custom. Verifica: se manca
l'hostname del LB o altri hostname/IP che erano nel cert originale:

1. Recupera gli SAN da includere (dal backup, dal cert originale o dalla config
   kubespray in `inventory/<cluster>/group_vars/k8s_cluster/k8s-cluster.yml`,
   campi `supplementary_addresses_in_ssl_keys` e simili).
2. Cancella il cert apiserver e rigeneralo con una config esplicita:
   ```bash
   sudo rm /etc/kubernetes/pki/apiserver.{crt,key}
   sudo kubeadm init phase certs apiserver \
     --config /path/to/kubeadm-config-con-sans.yaml
   ```
   In alternativa, aggiorna prima il ConfigMap `kubeadm-config` in `kube-system`
   e poi rilancia `kubeadm certs renew apiserver`.
3. Restart dell'apiserver (step 4).

### Kubelet client cert scaduto

`kubeadm certs renew` NON tocca il kubelet client cert
(`/var/lib/kubelet/pki/kubelet-client-current.pem`). Di solito ha auto-rotation
attivo (`rotateCertificates: true` nel kubelet config) e si rinnova da solo.

Verifica:
```bash
sudo ls -la /var/lib/kubelet/pki/
sudo openssl x509 -in /var/lib/kubelet/pki/kubelet-client-current.pem -noout -dates
```

Se è scaduto e non ruota:
```bash
sudo systemctl restart kubelet
# Poi approva eventuali CSR in pending
kubectl get csr
kubectl certificate approve <csr-name>
```

## Checklist finale (dopo tutti e 3 i master)

- [ ] `kubeadm certs check-expiration` su ogni master → tutti verdi
- [ ] `kubectl get nodes` → tutti i nodi `Ready`
- [ ] `kubectl get pod -A` → nessun pod in crash loop legato a TLS
- [ ] `kubectl -n kube-system get pod` → apiserver/cm/scheduler con pochi minuti
      di età
- [ ] Kubeconfig personale aggiornato su tutti gli host da cui lavori

## Riferimenti

- kubeadm: <https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/>
- kubespray cert management:
  <https://github.com/kubernetes-sigs/kubespray/blob/master/docs/operations/upgrades.md>
