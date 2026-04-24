# Benvenuto!

Benvenuto nel mio quaderno pubblico di appunti tecnici.

Qui raccolgo note, procedure e ragionamenti che uso (o ho usato) nel mio lavoro di **System Administrator / SRE / Cloud Engineer**. Tratto temi di infrastruttura cloud, orchestrazione, storage distribuito, networking e tutto ciò che ruota attorno a sistemi Linux di produzione.

Le note sono interconnesse: ogni appunto è un nodo in un grafo di conoscenza, e puoi navigare i collegamenti o usare la ricerca in alto a sinistra.

## 🧭 Aree tematiche

- ☸️ **Kubernetes** — Procedure operative su cluster K8s e gestione quotidiana
- 🌩️ **OpenStack** — Juju e Kolla: Deployment, troubleshooting e operatività
- 🗄️ **Ceph** — Storage distribuito: progettazione, tuning e gestione
- 🐧 **Linux & Sistemistica** — Fondamentali e tricks dall'esperienza operativa

## 🔎 Come navigare

- Usa la barra di ricerca in alto a sinistra per trovare un argomento
- Espandi l'indice **Esplora** a sinistra per sfogliare per cartella
- La **vista grafo** in alto a destra mostra le connessioni tra le note

## 📫 Contatti

- GitHub: <https://github.com/Artolink>
- LinkedIn: <https://www.linkedin.com/in/andreafarneti/>

---

## 🛠️ Stack tecnico

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

L'output finisce in `public/`. Punta il `root` di Nginx a `~/blog/public/` e ricarica.

---

## 📂 Struttura della repo

- `content/` → markdown del vault (quello che diventa il sito)
- `quartz/` → codice del generatore Quartz
- `quartz.config.ts` → configurazione sito (titolo, colori, font, lingua)
- `quartz.layout.ts` → layout dei componenti (sidebar, footer, ecc.)
- `deploy.sh` → script di build e deploy
- `public/` → output generato (non committato)

Tutto il resto è infrastruttura Quartz, da non toccare.
