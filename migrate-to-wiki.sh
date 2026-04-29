#!/bin/bash
# ============================================================================
# Migrazione blog.farnetiandrea.it -> wiki.farnetiandrea.it
# ============================================================================
# Eseguilo COME ROOT (sudo) DOPO aver aggiunto il record DNS:
#   wiki.farnetiandrea.it  A  195.231.87.122
#
# Cosa fa, in ordine:
#   1. Verifica che il DNS di wiki.farnetiandrea.it punti al VPS
#   2. Crea un server block placeholder per wiki (port 80) e ricarica nginx
#   3. Lancia certbot --nginx per ottenere il cert SSL e auto-extend il block
#   4. RIMUOVE completamente blog: config nginx + certificato Let's Encrypt
#   5. Ricarica nginx e ribuilda Quartz (come utente artolink)
# ============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] Rilancia con sudo: sudo bash $0" >&2
  exit 1
fi

DOMAIN_OLD="blog.farnetiandrea.it"
DOMAIN_NEW="wiki.farnetiandrea.it"
WEB_USER="artolink"
WEB_ROOT="/home/${WEB_USER}/blog/public"
EXPECTED_IP=$(hostname -I | awk '{print $1}')

# ── 1. DNS check ────────────────────────────────────────────────────────────
echo "==> [1/5] Verifica DNS di ${DOMAIN_NEW}..."
RESOLVED_IP=$(dig +short "${DOMAIN_NEW}" | tail -1)
if [[ -z "${RESOLVED_IP}" ]]; then
  echo "[ERROR] ${DOMAIN_NEW} non risolve. Aggiungi il record A → ${EXPECTED_IP} dal tuo provider DNS e riprova." >&2
  exit 1
fi
if [[ "${RESOLVED_IP}" != "${EXPECTED_IP}" ]]; then
  echo "[ERROR] ${DOMAIN_NEW} risolve a ${RESOLVED_IP}, ma il VPS è ${EXPECTED_IP}." >&2
  echo "        Controlla il record DNS prima di continuare." >&2
  exit 1
fi
echo "    OK: ${DOMAIN_NEW} → ${RESOLVED_IP}"

# ── 2. Placeholder nginx config per wiki (port 80, ACME challenge) ──────────
echo "==> [2/5] Scrittura placeholder /etc/nginx/conf.d/${DOMAIN_NEW}.conf..."
cat > "/etc/nginx/conf.d/${DOMAIN_NEW}.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NEW};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri.html \$uri/ =404;
    }
}
EOF

nginx -t
systemctl reload nginx
echo "    OK"

# ── 3. Certbot ──────────────────────────────────────────────────────────────
echo "==> [3/5] Ottengo certificato SSL via certbot --nginx..."
# --redirect estende il block port 80 con redirect HTTPS, e crea il block 443.
certbot --nginx -d "${DOMAIN_NEW}" --non-interactive --agree-tos --redirect --keep-until-expiring
echo "    OK"

# ── 4. Rimozione completa di blog: config nginx + cert Let's Encrypt ────────
echo "==> [4/5] Rimozione completa di ${DOMAIN_OLD}..."

# Rimuovi il config nginx (se esiste)
if [[ -f "/etc/nginx/conf.d/${DOMAIN_OLD}.conf" ]]; then
  rm -f "/etc/nginx/conf.d/${DOMAIN_OLD}.conf"
  echo "    Rimosso: /etc/nginx/conf.d/${DOMAIN_OLD}.conf"
fi

# Cancella il cert Let's Encrypt (per evitare tentativi di auto-renewal su un
# dominio non più servito). Se non esiste, certbot esce con codice ≠ 0: lo
# tolleriamo.
if [[ -d "/etc/letsencrypt/live/${DOMAIN_OLD}" ]]; then
  certbot delete --cert-name "${DOMAIN_OLD}" --non-interactive || true
  echo "    Cert ${DOMAIN_OLD} cancellato."
fi

nginx -t
systemctl reload nginx
echo "    OK"

# ── 5. Rebuild Quartz come artolink (per via di nvm/npm) ────────────────────
echo "==> [5/5] Rebuild + push Quartz con nuovo baseUrl..."
sudo -u "${WEB_USER}" -H bash -lc 'cd ~/blog && ./deploy.sh'
echo "    OK"

echo ""
echo "============================================================"
echo "Migrazione completata!"
echo "  ${DOMAIN_NEW}    → sito attivo (HTTPS)"
echo "  ${DOMAIN_OLD}    → rimosso (config + cert)"
echo "============================================================"
echo ""
echo "Nota: puoi anche rimuovere il record DNS di ${DOMAIN_OLD}"
echo "      dal tuo provider, ora non serve più."
