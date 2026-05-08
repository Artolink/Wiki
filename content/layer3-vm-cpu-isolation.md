# Layer 3 — Isolamento CPU VM via `machine.slice` (v5, SMT-aware)

> **Versione 5** — sostituito il calcolo dinamico `(RESERVED_END+1)-MAX_CPU` con la lettura/calcolo SMT-aware di `VM_CPUS` da `/etc/default/cpu-isolation` (`RESERVED_LOGICAL_CPUS` come input). Mantenuti i sotto-comandi `preflight`, `apply`, `status`, `rollback` e il flag `--runtime` per evitare drop-in duplicati.

## Problema

Su host hyperconverged, anche con Layer 1 (IRQ pinning) e Layer 2 (OSD pinning) attivi, **le VM possono ancora schedularsi sui core riservati a Ceph/OS**. La conseguenza è che gli OSD restano fissi sui thread dedicati, ma quei thread vengono comunque calpestati dai thread QEMU delle VM, vanificando in parte l'isolamento. Inoltre se la cpuset delle VM include i sibling SMT dei core OSD, le VM si pestano sulla cache L1/L2 dei core OSD.

Il Layer 3 chiude il cerchio: tutte le VM Nova (esistenti, nuove, e dopo live migration) usano esclusivamente i thread `VM_CPUS`, complemento esatto di `OSD_CPUS` e SMT-completo.

**Sfida**: farlo senza riavviare nessuna VM. I clienti non devono vedere downtime.

---

## Configurazione condivisa

Stesso file `/etc/default/cpu-isolation` usato da Layer 1 e Layer 2:

```bash
RESERVED_LOGICAL_CPUS=6
CEPH_VLANS="1065 1066"
OSD_MODE=shared
OSD_LOGICAL_CPUS_PER_OSD=4
```

Il Layer 3 usa **solo** `RESERVED_LOGICAL_CPUS` per derivare `VM_CPUS` come complemento di `OSD_CPUS`.

---

## Profili: TEST vs PROD

| Profilo | CPU logiche | `RESERVED_LOGICAL_CPUS` | `VM_CPUS`        |
|---------|------------:|-------------------------:|------------------|
| TEST hc01-03 | 24    | 6                        | `3-11,15-23`     |
| TEST hc04-05 | 56    | 6                        | `3-27,31-55`     |
| PROD esempio | 128   | 16                       | `8-63,72-127`    |

Lo script applica `AllowedCPUs=$VM_CPUS` direttamente su `machine.slice`. Stesso script su qualunque topology — `VM_CPUS` viene calcolato dinamicamente.

---

## Perché `cpu_shared_set` di Nova non basta

`[compute] cpu_shared_set` agisce nel driver libvirt di Nova **solo al momento della generazione del domain XML** (creazione di una nuova VM). Nova legge il valore e scrive nel XML:

```xml
<vcpu placement='static' cpuset='3-11,15-23'>4</vcpu>
<cputune>
  <emulatorpin cpuset='3-11,15-23'/>
</cputune>
```

Libvirt usa quei valori per impostare `cpuset.cpus` nei cgroup figli all'avvio del dominio.

### Limiti osservati

1. **Non retroattivo sulle VM esistenti.** VM già in running prima dell'applicazione di `cpu_shared_set` hanno un domain XML privo di `<cputune>` e di attributo `cpuset=` su `<vcpu>`. Esempio reale dal cluster TEST:

   ```
   root@cdti1hy-o01hc01:~# virsh dumpxml instance-00000bc4 | \
     grep -E '<vcpu|<cputune|emulatorpin|cpuset='
     <vcpu placement='static'>1</vcpu>

   root@cdti1hy-o01hc01:~# pid=$(pgrep -f "guest=instance-00000bc4,")
   root@cdti1hy-o01hc01:~# grep Cpus_allowed_list /proc/${pid}/status
   Cpus_allowed_list:      0-23
   ```

   Il domain XML è "muto" sul cpuset, e il cgroup eredita dal parent `machine.slice` (che vede tutti i core).

2. **Non viene riapplicato dalla live migration.** La live migration trasferisce il dominio così com'è dal sorgente al destinazione, senza rigenerare il XML. Una VM nata senza `<cputune>` resta senza `<cputune>` anche dopo migration verso un compute con `cpu_shared_set` configurato. Bug Nova documentato: [Launchpad #1869804](https://bugs.launchpad.net/nova/+bug/1869804).

   Il fix è entrato in **2024.2 Dalmatian** (Nova 30.0.0, ottobre 2024) sulle release precedenti va considerato assente salvo backport downstream esplicitamente verificato, perché il fix upstream richiede un version bump della `LibvirtLiveMigrateData` object con relative implicazioni RPC durante rolling upgrade.

   Anche **dopo** l'upgrade a Dalmatian, il fix Nova vincola le VM solo durante una live migration. Le VM esistenti che non vengono mai migrate restano non vincolate. La soluzione `machine.slice` invece le vincola tutte immediatamente, indipendentemente dalla live migration, e resta complementare al fix Nova anche post-upgrade.

3. **L'unico modo per applicare retroattivamente `cpu_shared_set` è ricreare il domain XML**, cioè hard reboot via Nova o cold migration. Entrambi richiedono downtime — incompatibile con il requisito "zero downtime per i clienti".

---

## Come funziona lo script

Su Ubuntu Jammy con cgroup v2 unified e libvirt che usa systemd come backend cgroup, le VM QEMU vivono sotto `machine.slice`. Path canonico:

```
/sys/fs/cgroup/machine.slice/machine-qemu\x2d<id>\x2d<name>.scope/libvirt/{emulator,vcpu0,...}
```

Su cgroup v2, `cpuset.cpus.effective` di un cgroup figlio è l'**intersezione** tra il proprio `cpuset.cpus` (richiesto) e `cpuset.cpus.effective` del padre. Se il figlio non richiede nulla — caso delle VM senza `<cputune>` — l'`effective` figlio collassa sull'`effective` padre.

Lo script applica `AllowedCPUs=$VM_CPUS` sul **parent slice** `machine.slice`. Tutti i discendenti ereditano automaticamente il vincolo, includendo correttamente solo i thread complementari a `OSD_CPUS`.

### Doppio strato di difesa

`cpu_shared_set` di Nova viene **mantenuto** uguale a `VM_CPUS`. Non è ridondante, è cintura+bretelle:

| Strato                           | Dove agisce                  | Quando                | Cosa garantisce                                |
|----------------------------------|------------------------------|-----------------------|------------------------------------------------|
| `cpu_shared_set` (Nova)          | XML libvirt + cgroup figlio  | Creazione nuove VM    | Le VM nuove nascono con `<cputune>` corretto   |
| `AllowedCPUs` (parent slice)     | cgroup parent                | Sempre, per ereditarietà | Vincolo runtime su tutte le VM, indipendente dal XML |

Se uno dei due viene rimosso, l'altro tiene. Per uscire completamente dall'isolamento bisogna rimuoverli entrambi.

### Perché il flag `--runtime` su `set-property`

Senza `--runtime`, `systemctl set-property` crea un proprio drop-in in `/etc/systemd/system/machine.slice.d/` con nome auto-generato. Coesistendo con il drop-in scritto a mano (`10-vm-allowed-cpus.conf`), si avrebbero **due file** sovrapposti. Funzionalmente OK, ma confusionario.

Con `--runtime`, `set-property` scrive solo in `/run/systemd/` (transient, perso al reboot). La persistenza è data esclusivamente dal drop-in scritto manualmente: **una sola fonte di verità**.

---

## Script

Sorgente completo: `scripts/enforce-vm-cpuset.sh`. Sotto-comandi:

- `preflight` — controlli preliminari (cgroup v2, machine.slice presente, cpuset controller abilitato, sample VM)
- `apply` — scrive drop-in permanente + applica runtime
- `status` — mostra stato corrente + verifica tutte le VM
- `rollback` — rimuove drop-in + rilascia runtime

Il calcolo SMT-aware include un safety check che fallisce esplicitamente se per qualunque ragione un core fisico finisse diviso tra OSD e VM (assert difensivo).

---

## Installazione

### 1. Configura `/etc/default/cpu-isolation`

Vedi Layer 1 — sezione "Configurazione condivisa".

### 2. Deploy script

```bash
MODEL=openstack
UNITS="nova-compute/0 nova-compute/1 nova-compute/2 nova-compute/3 nova-compute/4"
SCRIPT_DIR="/home/maas/cpu-isolation"

for unit in $UNITS; do
  echo "=== deploy Layer 3 on $unit ==="
  juju scp -m "$MODEL" "$SCRIPT_DIR/enforce-vm-cpuset.sh" "$unit":/tmp/
  juju ssh -m "$MODEL" "$unit" \
    "sudo install -m 0755 /tmp/enforce-vm-cpuset.sh /usr/local/sbin/enforce-vm-cpuset.sh"
done
```

### 3. Pre-flight per nodo

```bash
for unit in $UNITS; do
  echo "=========================================="
  echo "$unit"
  juju ssh -m "$MODEL" "$unit" "sudo /usr/local/sbin/enforce-vm-cpuset.sh preflight"
done
```

Se il preflight fallisce con "non in cgroup v2 unified" o "VM non sotto machine.slice", **fermarsi**.

### 4. Verifica flavor dedicated

```bash
openstack flavor list --all -c ID -f value | while read id; do
  name=$(openstack flavor show "$id" -c name -f value 2>/dev/null)
  props=$(openstack flavor show "$id" -c properties -f value 2>/dev/null)
  echo "$props" | grep -q "cpu_policy='dedicated'" && \
    echo "DEDICATED: $name ($id)"
done
# atteso: nessuna riga
```

- **Nessun flavor dedicated** (TEST attuale): configurare solo `cpu_shared_set` con `VM_CPUS`.
- **Esistono flavor dedicated**: serve disegno separato con `cpu_dedicated_set` disgiunto da `cpu_shared_set`. Vedi sezione "Flavor dedicated futuri" nei caveats.

### 5. Configura Nova `cpu_shared_set`

#### TEST

`juju config` non supporta `--unit`: il valore viene applicato globalmente. In TEST i nodi sono eterogenei (hc01-03 a 24 thread, hc04-05 a 56 thread) quindi serve override locale sui nodi grandi.

```bash
# Range minimo comune (hc01-03)

juju config -m openstack nova-compute cpu-shared-set="3-11,15-23"
watch -n5 "juju status -m openstack nova-compute --format=short"
```

Override locale TEST nodi a 56 core (`VM_CPUS=3-27,31-55`):

```bash
for unit in nova-compute/3 nova-compute/4; do
  juju ssh -m openstack "$unit" bash <<'EOF'
sudo sed -i "s|^cpu_shared_set = .*|cpu_shared_set = 3-27,31-55|" /etc/nova/nova.conf
sudo grep cpu_shared_set /etc/nova/nova.conf
sudo systemctl restart nova-compute
sudo systemctl is-active nova-compute
EOF
done
```

> ⚠️ L'override va riapplicato dopo ogni `juju config nova-compute ...`, `juju upgrade-charm nova-compute`, recovery agente Juju, cambio IP. PROD: evitare override locali, preferibile flotta omogenea o application Juju separati per hardware profile.

#### PROD (omogeneo) (fai una verifica della conf prima)

```bash
juju config -m <model-prod> nova-compute cpu-shared-set="8-63,72-127"
```

### 6. Sospendi scheduling Nova durante il rollout

⚠️ **L'ordine conta.** Una VM live-migrata da un nodo vincolato verso un nodo non ancora vincolato torna a vedere tutti i core (eredita dal `machine.slice` non vincolato del destinatario). Per evitare la finestra di vincolo intermittente, applicare il drop-in **a tutti i nodi nello stesso intervallo**, sospendendo lo scheduling Nova durante l'operazione.

Non hardcodare il suffisso host. Costruire una mappa dai compute host reali registrati in Nova.

```bash
MAP_FILE=/tmp/nova-compute-host-map.tsv
: > "$MAP_FILE"

for unit in $UNITS; do
  fqdn=$(juju ssh -m "$MODEL" "$unit" "hostname -f" | tr -d '\r')
  short=$(echo "$fqdn" | cut -d. -f1)
  compute_host=$(openstack compute service list --service nova-compute -f value -c Host | \
    awk -v fqdn="$fqdn" -v short="$short" '
      $0 == fqdn { print; exit }
      $0 == short { print; exit }
      index($0, short) == 1 { print; exit }
    ')
  [ -n "$compute_host" ] || { echo "ERROR: compute host non trovato per $unit / $fqdn"; exit 1; }
  printf "%s\t%s\n" "$unit" "$compute_host" | tee -a "$MAP_FILE"
done

while IFS=$'\t' read -r unit compute_host; do
  openstack compute service set --disable \
    --disable-reason "Layer 3 rollout in progress" \
    "$compute_host" nova-compute
done < "$MAP_FILE"

openstack compute service list --service nova-compute
# attesi tutti disabled
```

### 7. Apply su tutti i nodi (parallelo)

```bash
pids=""
for unit in $UNITS; do
  (
    echo "=== apply Layer 3 $unit ==="
    juju ssh -m "$MODEL" "$unit" "sudo /usr/local/sbin/enforce-vm-cpuset.sh apply"
  ) &
  pids="$pids $!"
done
fail=0
for pid in $pids; do
  wait "$pid" || fail=1
done
[ "$fail" -eq 0 ] || { echo "ERROR: apply Layer 3 fallito su almeno un nodo"; exit 1; }
```

Verifica veloce:

```bash
for unit in $UNITS; do
  juju ssh -m "$MODEL" "$unit" \
    "echo === \$(hostname) ===; cat /sys/fs/cgroup/machine.slice/cpuset.cpus.effective"
done
```

Output atteso TEST:

```
=== cdti1hy-o01hc01 ===
3-11,15-23
=== cdti1hy-o01hc02 ===
3-11,15-23
=== cdti1hy-o01hc03 ===
3-11,15-23
=== cdti1hy-o01hc04 ===
3-27,31-55
=== cdti1hy-o01hc05 ===
3-27,31-55
```

### 8. Riabilita scheduling Nova

```bash
while IFS=$'\t' read -r unit compute_host; do
  openstack compute service set --enable "$compute_host" nova-compute
done < /tmp/nova-compute-host-map.tsv

openstack compute service list --service nova-compute
# attesi tutti enabled/up
```

---

## Verifica

### Status per nodo

```bash
for unit in $UNITS; do
  echo "=========================================="
  echo "$unit"
  juju ssh -m "$MODEL" "$unit" \
    "sudo /usr/local/sbin/enforce-vm-cpuset.sh status"
done
```

Output atteso: `VM con leak su OSD_CPUS: 0` su tutti i nodi. Un subset di `VM_CPUS` è accettabile e viene mostrato come `OK subset VM_CPUS`.

### Validazione live migration cross-node

Test funzionale: confermare che il vincolo sopravvive a una live migration tra nodi entrambi vincolati.

```bash
VM_ID=<id-vm-test-non-critica>

SRC=$(openstack server show "$VM_ID" -c OS-EXT-SRV-ATTR:host -f value)
echo "VM su: $SRC"

openstack server migrate --live-migration "$VM_ID"
while [ "$(openstack server show "$VM_ID" -c status -f value)" != "ACTIVE" ]; do
  sleep 5
done

DST=$(openstack server show "$VM_ID" -c OS-EXT-SRV-ATTR:host -f value)
echo "VM ora su: $DST"

DST_UNIT=$(juju status -m "$MODEL" nova-compute --format=json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for u, v in d['applications']['nova-compute']['units'].items():
    addr = v.get('public-address', '')
    if addr and '$DST'.startswith(addr.split('.')[0]):
        print(u); break
")

juju ssh -m "$MODEL" "$DST_UNIT" bash <<EOF
vm=\$(virsh list --name | xargs -I{} sh -c \
  "virsh dumpxml {} 2>/dev/null | grep -q $VM_ID && echo {}")
pid=\$(pgrep -f "guest=\${vm},")
echo "VM \$vm post-migration cpuset: \$(taskset -pc \$pid | awk '{print \$NF}')"
EOF
```

Atteso: il valore deve corrispondere a `VM_CPUS` del nodo destinatario.

---

## Persistenza e durabilità

Il drop-in vive in `/etc/systemd/system/machine.slice.d/10-vm-allowed-cpus.conf` — directory **esterna** al tree gestito dalla charm Juju. Sopravvive a:

- `juju config nova-compute <key>=<value>`
- `juju upgrade-charm nova-compute`
- Riavvii del sistema
- Recovery dell'agente Juju
- `systemctl daemon-reload`

Solo l'override di `cpu_shared_set` in `/etc/nova/nova.conf` (TEST hc04/hc05) viene riscritto da Juju e va riapplicato.

### Reboot del nodo

Il drop-in viene letto da systemd durante l'attivazione di `machine.slice` (early boot, prima di libvirtd). Quando libvirtd parte, le VM nascono già sotto il vincolo. **Non c'è finestra non isolata.**

Verifica post-reboot:

```bash
sudo /usr/local/sbin/enforce-vm-cpuset.sh status
```

---

## Rollback

### Singolo nodo

```bash
sudo /usr/local/sbin/enforce-vm-cpuset.sh rollback
```

Effetto:

- Rilascia runtime a tutti i CPU online
- Rimuove il drop-in persistente
- Non riavvia VM, non riavvia libvirt

Le VM tornano a vedere tutti i core entro millisecondi.

### Fleet completo

```bash
for unit in $UNITS; do
  juju ssh -m "$MODEL" "$unit" \
    "sudo /usr/local/sbin/enforce-vm-cpuset.sh rollback"
done

juju config -m "$MODEL" nova-compute --reset cpu-shared-set
```

---

## Troubleshooting

### Una VM mostra ancora cpuset non vincolato dopo l'apply

```bash
vm=instance-00000bc4
pid=$(pgrep -f "guest=${vm},")

# Path completo del cgroup
cat /proc/${pid}/cgroup
# atteso: 0::/machine.slice/machine-qemu\x2d...\x2d${vm}.scope/libvirt/emulator

# cpuset ai vari livelli
cgrel=$(awk -F: '$2 == "" {print $3}' /proc/${pid}/cgroup)
scope_path="/sys/fs/cgroup${cgrel%/libvirt/emulator}"
echo "scope:    $(cat ${scope_path}/cpuset.cpus.effective)"
echo "libvirt:  $(cat ${scope_path}/libvirt/cpuset.cpus.effective)"
echo "emulator: $(cat ${scope_path}/libvirt/emulator/cpuset.cpus.effective)"

# Forza riapplicazione runtime
sudo /usr/local/sbin/enforce-vm-cpuset.sh apply
```

Se il cgroup della VM non è sotto `/machine.slice/`, fermarsi e verificare la configurazione libvirt/systemd.

### `set-property` fallisce con "Unknown assignment"

systemd troppo vecchio (< 244). Su Jammy non dovrebbe accadere.

```bash
systemctl --version | head -1
```

### `cpuset.cpus.effective` di `machine.slice` è vuoto

Il valore vuoto eredita dal parent (root → tutti i core). Significa che `set-property --runtime` non è stato eseguito o è stato eseguito con valore vuoto:

```bash
sudo /usr/local/sbin/enforce-vm-cpuset.sh apply
```

### Il drop-in c'è ma `cpuset.cpus.effective` non corrisponde

Verificare che `daemon-reload` sia avvenuto e che `set-property --runtime` abbia avuto effetto:

```bash
cat /etc/systemd/system/machine.slice.d/10-vm-allowed-cpus.conf
systemctl show machine.slice -p AllowedCPUs -p EffectiveCPUs
sudo systemctl daemon-reload
sudo /usr/local/sbin/enforce-vm-cpuset.sh apply
```

### Errore "core fisico SMT diviso tra OSD e VM"

Lo script ha rilevato un'incoerenza nel calcolo (assert difensivo). Cause possibili:

- File `/etc/default/cpu-isolation` modificato manualmente con valori incoerenti
- Topologia cambiata dopo hot-(un)plug CPU
- Bug nel kernel sull'esposizione `thread_siblings_list`

Verificare:

```bash
cat /etc/default/cpu-isolation
for cpu in 0 1 2 3; do
  echo "cpu${cpu}: $(cat /sys/devices/system/cpu/cpu${cpu}/topology/thread_siblings_list)"
done
```

---

## Caveats

- **Aggiunta di un nuovo nodo compute**: configurare `/etc/default/cpu-isolation` e applicare i 3 layer prima di abilitare lo scheduling Nova. Lo script calcola `OSD_CPUS`/`VM_CPUS` automaticamente dalla topology locale.

- **Sostituzione hardware con CPU diversa**: il file `/etc/default/cpu-isolation` resta uguale (è dichiarativo). Lo script ricalcola automaticamente i range alla prima esecuzione. Verificare manualmente l'output con `enforce-vm-cpuset.sh status`.

- **Live migration verso un compute non vincolato**: una VM atterrata su un host senza Layer 3 torna a vedere tutti i core. Per questo il rollout va completato su tutti gli HCI prima di considerare chiusa l'attività.

- **Non riavviare `machine.slice`**: `systemctl restart machine.slice` o `systemctl stop machine.slice` **terminano tutte le VM** (systemd considera lo slice il parent di tutti gli scope figli e li ferma a cascata). Per modificare `AllowedCPUs` runtime usare sempre `set-property --runtime`, mai restart.

- **Non scrivere manualmente nei cgroup delle singole VM**: scritture in `/sys/fs/cgroup/machine.slice/machine-qemu-*/cpuset.cpus` sono volatili (libvirt le sovrascrive al prossimo evento) e creano inconsistenza con lo stato libvirt. Il vincolo va sempre applicato sul parent slice.

- **Coesistenza con cgroup v1 (legacy)**: `AllowedCPUs=` su slice richiede cgroup v2 unified. Su Jammy è il default. Se il sistema fosse forzato in modalità ibrida (`systemd.unified_cgroup_hierarchy=0` in cmdline), la procedura non funziona. Verifica:

  ```bash
  stat -fc %T /sys/fs/cgroup
  # atteso: cgroup2fs
  ```

### Flavor dedicated futuri

Se in futuro si vorranno introdurre flavor `hw:cpu_policy=dedicated`:

1. `cpu_dedicated_set` deve essere **disgiunto** da `cpu_shared_set`
2. L'unione `cpu_dedicated_set ∪ cpu_shared_set` deve essere **contenuta** in `AllowedCPUs` di `machine.slice` (cioè in `VM_CPUS`)
3. Entrambi i set devono rispettare la topology siblings SMT

Esempio PROD 128 thread, suddivisione shared+dedicated dentro `VM_CPUS="8-63,72-127"`:

```ini
# nova.conf — DEVE essere SMT-sibling-aware
cpu_shared_set    = 8-31,72-95   (24 core fisici per VM standard)
cpu_dedicated_set = 32-63,96-127 (32 core fisici per VM con pinning)
```

```
# machine.slice (deve contenere il superset)
AllowedCPUs=8-63,72-127
```

Se Nova prova a pinnare una VM dedicated su un thread fuori da `AllowedCPUs`, libvirt fallisce in fase di scrittura `cpuset.cpus`. Failsafe desiderato: previene VM con pinning su core OSD.

### VM esistenti con `<cputune>` su core riservati

Check preventivo prima del rollout:

```bash
for unit in $UNITS; do
  juju ssh -m "$MODEL" "$unit" bash <<'EOF'
. /etc/default/cpu-isolation
echo "=== $(hostname) ==="

# Calcola OSD_CPUS in modo SMT-aware (stessa logica degli script)
OSD_CPUS=$(/usr/local/sbin/cpu-isolation-calc.sh 2>/dev/null | grep '^OSD_CPUS=' | cut -d= -f2)
echo "OSD_CPUS: $OSD_CPUS"

reserved_set=$(python3 -c "
spec = '$OSD_CPUS'
out = set()
for part in spec.split(','):
    if '-' in part:
        a,b = map(int, part.split('-'))
        out.update(range(a,b+1))
    else:
        out.add(int(part))
print(' '.join(str(x) for x in sorted(out)))
")

for vm in $(virsh list --name); do
  pinned=$(virsh dumpxml "$vm" | grep -oP 'cpuset='"'"'\K[^'"'"']+' | tr ',' '\n' | sort -u)
  for r in $pinned; do
    case "$r" in
      *-*) start=${r%-*}; end=${r#*-};;
      *)   start=$r; end=$r;;
    esac
    for ((c=start; c<=end; c++)); do
      for x in $reserved_set; do
        [ "$c" = "$x" ] && echo "  CONFLICT: $vm pin=$r touches reserved cpu $x"
      done
    done
  done
done
EOF
done
```

Se compaiono CONFLICT: il vincolo del parent slice impedirà a quelle VM di ottenere quei thread. Le VM running continuano (libvirt ha già scritto il cpuset all'avvio), ma al prossimo restart libvirt fallirà. Ricreare quelle VM con flavor adeguati prima di Layer 3.

---

## Host di applicazione (TEST)

| Hostname        | Juju machine | CPU logiche | `VM_CPUS` atteso | Layer 3 |
|-----------------|--------------|------------:|------------------|---------|
| cdti1hy-o01hc01 | 3            | 24          | `3-11,15-23`     | ⏳       |
| cdti1hy-o01hc02 | 4            | 24          | `3-11,15-23`     | ⏳       |
| cdti1hy-o01hc03 | 5            | 24          | `3-11,15-23`     | ⏳       |
| cdti1hy-o01hc04 | 7            | 56          | `3-27,31-55`     | ⏳       |
| cdti1hy-o01hc05 | 6            | 56          | `3-27,31-55`     | ⏳       |
