// Hamburger drawer per il menu sinistro su mobile/tablet stretto.
// Stato effimero (no localStorage): l'attributo `data-mobile-sidebar-open` su
// <html> viene messo a "true" quando il drawer è aperto. Il CSS in
// mobileSidebarToggle.scss usa quell'attributo per:
//   - mostrare la sidebar.left come drawer fisso che entra da sinistra
//   - mostrare un backdrop sfocato sopra il resto della pagina

const ATTR = "data-mobile-sidebar-open"
const BACKDROP_CLASS = "mobile-sidebar-backdrop"

function isOpen(): boolean {
  return document.documentElement.getAttribute(ATTR) === "true"
}

function setOpen(open: boolean) {
  document.documentElement.setAttribute(ATTR, open ? "true" : "false")
  for (const btn of document.getElementsByClassName("mobile-sidebar-toggle")) {
    btn.setAttribute("aria-expanded", String(open))
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
  // Reset dello stato ad ogni navigazione: se l'utente clicca un link nel
  // drawer e va a un'altra pagina, vogliamo che il drawer si chiuda.
  setOpen(false)

  const backdrop = ensureBackdrop()

  function toggle() {
    setOpen(!isOpen())
  }
  function close() {
    setOpen(false)
  }

  for (const btn of document.getElementsByClassName("mobile-sidebar-toggle")) {
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
