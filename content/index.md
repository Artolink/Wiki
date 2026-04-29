# Benvenuto!

Benvenuto nella mia Wiki! Qui trovi [chi sono io](https://www.linkedin.com/in/andreafarneti/).

**TL;DR** Il mio percorso lavorativo è stato il seguente:
- **Riparazione/installazione HW**: prendevo il furgoncino e andavo a fare [queste cose](https://github.com/user-attachments/assets/0be38a78-6e00-4ac0-b0da-e6ef47d060eb): riparare, installare e configurare PC, rack, switch, router, firewall...
- **IT Technical Specialist (NOC)**: supporto a 100+ clienti diversi con infrastrutture diverse e attività On-Site autonome.
- **System Administrator (SOC)**: Malware e Mail Threat Analysis, gestione sicura del dominio aziendale, hardening del networking e di ogni endpoint.
- **Cloud Engineer (Open-Source)**: Linux, Git, Ansible, AWX, Terraform/OpenTofu, MAAS, BareOS, KVM, QEMU, LXD/LXC, Docker, Kubernetes, Ceph, Openstack, Kafka, Observability (ELK Stack, Prometheus, Telegraf, Victoria Metrics, Grafana...), scripting (Bash, Python, Powershell), networking (e BGP) eccetera eccetera...

In questa Wiki raccolgo tutto ciò che è fondamentale sapere per operare nei lavori che ti ho menzionato, in maniera **professionale** e **metodica**. 

Ciò che distingue quindi queste note dal chiedere consigli all'AI di turno, è che qui trovi:
- l'esperienza **vera** di una persona che ha lavorato in realtà **grandi** ed **internazionali**, su sistemi di **produzione** con turni di **reperibilità**
- contenuti **mirati** ma dettagliati, riportati in maniera concentrata e strettamente coerenti l'uno con l'altro
- integrazioni utili: collegamenti alla teoria, consigli e software per facilitare il lavoro e migliorarne la qualità
 
Le note sono **veramente** interconnesse: ogni appunto è un nodo in un grafo, per cui ognuna di esse contiene solo lo stretto necessario.<br>
Puoi quindi vedere fisicamente tutti i collegamenti che un argomento richiede a livello di conoscenze e navigare fra di essi senza trovare mai ripetizioni.
L'insieme di tutti i collegamenti di un determinato argomento, ti fornisce una visione reale della sua profondità e di ciò che ti serve per comprenderlo a fondo.

Inizia subito!

---

## 🛠️ Stack della Wiki

Il sito è generato con [Quartz 4](https://quartz.jzhao.xyz/), un generatore di siti statici basato su file Markdown pensato per pubblicare vault [Obsidian](https://obsidian.md/). 
Il deploy avviene su VPS Ubuntu con Nginx come web server.

---

## 🚀 Ripristino della Wiki su una macchina nuova

Prerequisiti: Ubuntu 22.04+, utente non-root con `sudo`, Nginx e Certbot già configurati per il dominio.

### 1. Installa Node.js 22

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
```

### 2. Clona la repo e installa le dipendenze

```bash
cd ~
git clone git@github.com:Artolink/blog.git wiki
cd wiki
npm install
```

### 3. Genera il sito

```bash
npx quartz build
```

L'output finisce in `public/`. 
Punta quindi il `root` di Nginx a `~/wiki/public/` e ricarica.

---

## 📂 Struttura della repo

- `content/` → markdown del vault (quello che diventa il sito)
- `quartz/` → codice del generatore Quartz
- `quartz.config.ts` → configurazione sito (titolo, colori, font, lingua)
- `quartz.layout.ts` → layout dei componenti (sidebar, footer, ecc.)
- `deploy.sh` → script di build e deploy
- `public/` → output generato (non committato)

Tutto il resto è infrastruttura Quartz, da non toccare.
