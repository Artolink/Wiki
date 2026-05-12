// Toggle visibilità della sidebar sinistra. Stato persistito in localStorage,
// applicato come attributo `data-sidebar-collapsed` su <html> per evitare il
// flash al primo render.
//
// Inoltre: drag-resize della sidebar via handle sul bordo destro. La width
// scelta è persistita in localStorage e applicata come CSS var
// `--sidebar-left-width` (usata dalle media query del grid in custom.scss).

const STORAGE_KEY = "sidebarCollapsed"
const WIDTH_KEY = "sidebarWidth"
const MAX_WIDTH = 540 // px — oltre questo cap la sidebar invade il content
const HANDLE_CLASS = "sidebar-resize-handle"

// Min width = larghezza di default del breakpoint corrente. L'utente può
// solo ALLARGARE, mai restringere sotto il default. ≥1500px → 3-col layout
// con sidebar minmax(260,340); 1101-1499 → 2-col con minmax(240,320).
function getMinWidth(): number {
  return window.matchMedia("(min-width: 1500px)").matches ? 340 : 320
}

function readState(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true"
}

function applyState(collapsed: boolean) {
  document.documentElement.setAttribute(
    "data-sidebar-collapsed",
    collapsed ? "true" : "false",
  )
}

function readSavedWidth(): number | null {
  const raw = localStorage.getItem(WIDTH_KEY)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function applyWidth(width: number | null) {
  if (width === null) {
    document.documentElement.style.removeProperty("--sidebar-left-width")
  } else {
    document.documentElement.style.setProperty("--sidebar-left-width", width + "px")
  }
}

// Applica subito (beforeDOMLoaded) per non avere flash di sidebar visibile
// o di width sbagliata al primo render.
applyState(readState())
applyWidth(readSavedWidth())

document.addEventListener("nav", () => {
  applyState(readState())
  applyWidth(readSavedWidth())

  function toggle() {
    const next = !readState()
    localStorage.setItem(STORAGE_KEY, String(next))
    applyState(next)
    // Notifica i componenti che misurano la propria larghezza al render
    // (es. graph.inline.ts su Pixi) che il layout grid è cambiato e devono
    // rifare i conti — altrimenti il canvas resta dimensionato sul vecchio
    // grid e finisce troncato/vuoto.
    window.dispatchEvent(new CustomEvent("sidebartoggled"))
  }

  for (const btn of document.getElementsByClassName("sidebar-toggle")) {
    btn.addEventListener("click", toggle)
    window.addCleanup(() => btn.removeEventListener("click", toggle))
  }

  // ── Drag-resize handle ─────────────────────────────────────────────────
  const sidebar = document.querySelector(".sidebar.left") as HTMLElement | null
  if (!sidebar) return
  // Idempotente: se l'handle esiste già (SPA nav su stessa istanza DOM),
  // non lo ricreiamo.
  if (sidebar.querySelector("." + HANDLE_CLASS)) return

  const handle = document.createElement("div")
  handle.className = HANDLE_CLASS
  sidebar.appendChild(handle)

  let dragging = false
  let startX = 0
  let startWidth = 0

  function onPointerDown(e: PointerEvent) {
    dragging = true
    startX = e.clientX
    startWidth = sidebar!.getBoundingClientRect().width
    handle.classList.add("dragging")
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    handle.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const delta = e.clientX - startX
    const newWidth = Math.max(getMinWidth(), Math.min(MAX_WIDTH, startWidth + delta))
    applyWidth(newWidth)
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    handle.classList.remove("dragging")
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    try {
      handle.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }

    // Salva la width finale. Se l'utente l'ha riportata al minimo, rimuoviamo
    // la chiave così il fallback del minmax torna a essere responsive.
    const finalWidth = Math.round(sidebar!.getBoundingClientRect().width)
    if (finalWidth > getMinWidth()) {
      localStorage.setItem(WIDTH_KEY, String(finalWidth))
    } else {
      localStorage.removeItem(WIDTH_KEY)
      applyWidth(null)
    }

    // Avvisa graph & co. che il layout è cambiato (stesso evento del toggle).
    window.dispatchEvent(new CustomEvent("sidebartoggled"))
  }

  handle.addEventListener("pointerdown", onPointerDown)
  handle.addEventListener("pointermove", onPointerMove)
  handle.addEventListener("pointerup", onPointerUp)
  handle.addEventListener("pointercancel", onPointerUp)

  window.addCleanup(() => {
    handle.removeEventListener("pointerdown", onPointerDown)
    handle.removeEventListener("pointermove", onPointerMove)
    handle.removeEventListener("pointerup", onPointerUp)
    handle.removeEventListener("pointercancel", onPointerUp)
    handle.remove()
  })
})
