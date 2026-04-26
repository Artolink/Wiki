# Benvenuto!

Benvenuto nella mia Wiki! Qui trovi [chi sono io](https://www.linkedin.com/in/andreafarneti/).

**TL;DR** Il mio percorso lavorativo è stato il seguente:
- Riparazione/installazione HW: prendevo il furgoncino e andavo a fare [queste cose](https://github.com/user-attachments/assets/0be38a78-6e00-4ac0-b0da-e6ef47d060eb) (installare/configurare PC, Switch, Router, Firewall...)
- IT Technical Specialist (NOC): supporto a 100+ clienti diversi con infrastrutture diverse (SO Windows) e attività On-Site in solitaria
- System Administrator (SOC): Malware e Mail Threat Analysis, gestione sicura del dominio aziendale, hardening del networking e di ogni endpoint.
- Cloud Engineer (Open-Source): Linux, Git, Ansible, AWX, Terraform/OpenTofu, MAAS, Docker, Kubernetes, Ceph, Openstack...

Qui raccolgo lo stretto necessario che è fondamentale sapere per operare in ognuno dei lavori che ho menzionato, con l'aggiunta di teoria, consigli e SoftWare per facilitarne e migliorarne la qualità. 
Lo standard qualitativo che troverete è quello per il lavoro in sistemi di produzione con turni di reperibilità, come ho sempre fatto.

Le note sono interconnesse: ogni appunto è un nodo in un grafo di conoscenza, e puoi navigare i collegamenti o usare la ricerca in alto a sinistra.

---

## 🛠️ Stack della Wiki

Il sito è generato con [Quartz 4](https://quartz.jzhao.xyz/), un generatore di siti statici basato su file Markdown pensato per pubblicare vault [Obsidian](https://obsidian.md/). Il deploy avviene su VPS Ubuntu con Nginx come web server.

---

## 🚀 Ripristino del blog su una macchina nuova

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
git clone git@github.com:Artolink/blog.git
cd blog
npm install
```

### 3. Genera il sito

```bash
npx quartz build
```

L'output finisce in `public/`. 
Punta quindi il `root` di Nginx a `~/blog/public/` e ricarica.

---

## 📂 Struttura della repo

- `content/` → markdown del vault (quello che diventa il sito)
- `quartz/` → codice del generatore Quartz
- `quartz.config.ts` → configurazione sito (titolo, colori, font, lingua)
- `quartz.layout.ts` → layout dei componenti (sidebar, footer, ecc.)
- `deploy.sh` → script di build e deploy
- `public/` → output generato (non committato)

Tutto il resto è infrastruttura Quartz, da non toccare.
