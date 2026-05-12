// Checkbox interattive (`- [ ]` markdown e `<input type="checkbox">` inline
// nei titoli). NON persistite: ogni refresh di pagina riazzera lo stato.
// Mantengo l'evento `change` solo per non bloccare eventuali listener custom
// (es. pageProgress.inline.ts che aggiorna la pillola di completamento).

// One-time cleanup: rimuovi chiavi `<slug>-checkbox-<N>` lasciate in
// localStorage da una versione precedente di questo script che persisteva
// lo stato. Senza pulizia, le chiavi orfane resterebbero per sempre.
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i)
  if (key && /-checkbox-\d+$/.test(key)) {
    localStorage.removeItem(key)
  }
}

// Nessun listener da attaccare: il browser gestisce nativamente il toggle
// della checkbox al click, e l'evento `change` propaga ai listener di altri
// script (vedi pageProgress.inline.ts). Mantengo comunque l'addEventListener
// "nav" vuoto per coerenza col pattern, ma non c'è logica.
