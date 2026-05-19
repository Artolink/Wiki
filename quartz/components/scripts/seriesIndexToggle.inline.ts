// Toggle del popup "Index" della topbar.
// Click sul pulsante → apri/chiudi il popup (toggle class .open).
// Click ovunque fuori dal componente → chiudi tutti i popup aperti.
// Esc → idem.
function setupSeriesIndexToggle() {
  const wrappers = document.querySelectorAll<HTMLElement>(".series-index-toggle")
  if (wrappers.length === 0) return

  const closeAll = () => {
    for (const w of wrappers) {
      const popup = w.querySelector<HTMLElement>(".series-index-popup")
      const btn = w.querySelector<HTMLElement>(".series-index-toggle-btn")
      popup?.classList.remove("open")
      popup?.setAttribute("aria-hidden", "true")
      btn?.setAttribute("aria-expanded", "false")
    }
  }

  // In mobile (≤1100px) il popup floating è nascosto via CSS, e il bottone
  // libro funge invece da toggle per il SeriesIndex statico presente nel
  // drawer destro. Deleghiamo il click al pulsante header del blocco statico.
  const isMobile = () => window.matchMedia("(max-width: 1100px)").matches

  for (const wrapper of wrappers) {
    const button = wrapper.querySelector<HTMLElement>(".series-index-toggle-btn")
    const popup = wrapper.querySelector<HTMLElement>(".series-index-popup")
    if (!button || !popup) continue

    const onClick = (e: Event) => {
      e.stopPropagation()

      if (isMobile()) {
        // Delegate al SeriesIndex statico nel drawer destro
        const staticHeader = document.querySelector<HTMLElement>(
          ".sidebar.right .series-index-header",
        )
        staticHeader?.click()
        return
      }

      // Desktop: comportamento popup floating
      const isOpen = popup.classList.toggle("open")
      popup.setAttribute("aria-hidden", isOpen ? "false" : "true")
      button.setAttribute("aria-expanded", isOpen ? "true" : "false")
    }

    button.addEventListener("click", onClick)
    window.addCleanup(() => button.removeEventListener("click", onClick))
  }

  // Chiudi al click esterno (qualsiasi punto fuori da .series-index-toggle)
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Element
    if (!target.closest(".series-index-toggle")) {
      closeAll()
    }
  }
  document.addEventListener("click", onDocClick)
  window.addCleanup(() => document.removeEventListener("click", onDocClick))

  // Chiudi su Esc
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeAll()
  }
  document.addEventListener("keydown", onKey)
  window.addCleanup(() => document.removeEventListener("keydown", onKey))
}

document.addEventListener("nav", () => {
  setupSeriesIndexToggle()
})
