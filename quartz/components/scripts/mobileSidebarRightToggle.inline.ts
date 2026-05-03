// Hamburger drawer per la sidebar destra su mobile/tablet stretto. Speculare
// a mobileSidebarToggle.inline.ts: usa l'attributo `data-mobile-sidebar-right-open`
// su <html>. Il backdrop è condiviso col drawer sinistro (creato qui se manca,
// idempotent). Aprire un drawer chiude l'altro.

const ATTR_RIGHT = "data-mobile-sidebar-right-open"
const ATTR_LEFT = "data-mobile-sidebar-open"
const BACKDROP_CLASS = "mobile-sidebar-backdrop"

function isOpen(): boolean {
  return document.documentElement.getAttribute(ATTR_RIGHT) === "true"
}

function setOpen(open: boolean) {
  document.documentElement.setAttribute(ATTR_RIGHT, open ? "true" : "false")
  for (const btn of document.getElementsByClassName("mobile-sidebar-right-toggle")) {
    btn.setAttribute("aria-expanded", String(open))
  }
}

function closeOther() {
  document.documentElement.setAttribute(ATTR_LEFT, "false")
  for (const btn of document.getElementsByClassName("mobile-sidebar-toggle")) {
    btn.setAttribute("aria-expanded", "false")
  }
}

function ensureBackdrop(): HTMLElement {
  let backdrop = document.querySelector("." + BACKDROP_CLASS) as HTMLElement | null
  if (!backdrop) {
    backdrop = document.createElement("div")
    backdrop.className = BACKDROP_CLASS
    backdrop.setAttribute("aria-hidden", "true")
    document.body.appendChild(backdrop)
  }
  return backdrop
}

document.addEventListener("nav", () => {
  setOpen(false)
  const backdrop = ensureBackdrop()

  function toggle() {
    const next = !isOpen()
    if (next) closeOther()
    setOpen(next)
  }
  function close() {
    setOpen(false)
  }

  for (const btn of document.getElementsByClassName("mobile-sidebar-right-toggle")) {
    btn.addEventListener("click", toggle)
    window.addCleanup(() => btn.removeEventListener("click", toggle))
  }

  backdrop.addEventListener("click", close)
  window.addCleanup(() => backdrop.removeEventListener("click", close))

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen()) close()
  }
  document.addEventListener("keydown", onKey)
  window.addCleanup(() => document.removeEventListener("keydown", onKey))
})
