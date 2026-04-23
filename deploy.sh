#!/bin/bash
# Deploy del blog Quartz
# - Rigenera public/ con Quartz
# - Committa e pusha su GitHub (backup + disaster recovery)

set -euo pipefail

# Carica nvm (necessario perché .bashrc non viene letto via SSH non-interattivo)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd ~/blog

echo "==> [1/3] Build Quartz..."
npx quartz build

echo "==> [2/3] Fix permessi public/ per nginx..."
chmod -R o+rX public/

echo "==> [3/3] Commit e push su GitHub..."
if [[ -n "$(git status --porcelain)" ]]; then
    git add .
    git commit -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    git push origin main
    echo "==> Push completato."
else
    echo "==> Nessuna modifica da committare."
fi

echo "==> Deploy completato. Sito online: https://blog.farnetiandrea.it"
