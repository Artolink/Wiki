// Toggle visibility del grafo nella sidebar destra.
// Stato salvato in localStorage; default = visibile.
// L'attributo data-graph-hidden viene scritto su <html> così il CSS può
// nascondere immediatamente il grafo senza flash (vedi custom.scss).

const STORAGE_KEY = "graphHidden"

function readState(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true"
}

function applyState(hidden: boolean) {
  document.documentElement.setAttribute("data-graph-hidden", hidden ? "true" : "false")
}

// Applica lo stato salvato il prima possibile (beforeDOMLoaded) per evitare flash
applyState(readState())

document.addEventListener("nav", () => {
  // Riapplica lo stato corrente all'inizio di ogni navigazione SPA
  applyState(readState())

  function toggle() {
    const next = !readState()
    localStorage.setItem(STORAGE_KEY, String(next))
    applyState(next)
  }

  for (const btn of document.getElementsByClassName("graph-toggle")) {
    btn.addEventListener("click", toggle)
    window.addCleanup(() => btn.removeEventListener("click", toggle))
  }
})
