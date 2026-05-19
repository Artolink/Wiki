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

  // In mobile (≤1100px) il popup floating è disabilitato via CSS. Il bottone
  // libro nel drawer destro fa toggle dell'intero blocco SeriesIndex statico
  // (show/hide), settando l'attributo `data-series-index-open` su <html>. Il
  // CSS in seriesIndex.scss usa quell'attributo per `display: flex/none`.
  const ATTR_INDEX_OPEN = "data-series-index-open"
  const isMobile = () => window.matchMedia("(max-width: 1100px)").matches

  // Reset dello stato a ogni nav (chiudi se cambi pagina)
  document.documentElement.setAttribute(ATTR_INDEX_OPEN, "false")

  for (const wrapper of wrappers) {
    const button = wrapper.querySelector<HTMLElement>(".series-index-toggle-btn")
    const popup = wrapper.querySelector<HTMLElement>(".series-index-popup")
    if (!button || !popup) continue

    const onClick = (e: Event) => {
      e.stopPropagation()

      if (isMobile()) {
        const open =
          document.documentElement.getAttribute(ATTR_INDEX_OPEN) === "true"
        document.documentElement.setAttribute(ATTR_INDEX_OPEN, open ? "false" : "true")
        button.setAttribute("aria-expanded", open ? "false" : "true")
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
