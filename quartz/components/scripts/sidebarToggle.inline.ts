// Toggle visibilità della sidebar sinistra. Stato persistito in localStorage,
// applicato come attributo `data-sidebar-collapsed` su <html> per evitare il
// flash al primo render.

const STORAGE_KEY = "sidebarCollapsed"

function readState(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true"
}

function applyState(collapsed: boolean) {
  document.documentElement.setAttribute(
    "data-sidebar-collapsed",
    collapsed ? "true" : "false",
  )
}

// Applica subito (beforeDOMLoaded) per non avere flash di sidebar visibile
applyState(readState())

document.addEventListener("nav", () => {
  applyState(readState())

  function toggle() {
    const next = !readState()
    localStorage.setItem(STORAGE_KEY, String(next))
    applyState(next)
  }

  for (const btn of document.getElementsByClassName("sidebar-toggle")) {
    btn.addEventListener("click", toggle)
    window.addCleanup(() => btn.removeEventListener("click", toggle))
  }
})
