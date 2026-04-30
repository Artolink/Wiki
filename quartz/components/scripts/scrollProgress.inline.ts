// ScrollProgress: barra/etichetta floating in basso che mostra la percentuale
// di scorrimento del file md corrente. Visibile solo durante lo scroll attivo;
// scompare dopo HIDE_DELAY_MS di immobilità.
//
// Calcolo % = scrollY / (scrollHeight - viewportHeight) * 100, clampato 0-100.

const HIDE_DELAY_MS = 700

document.addEventListener("nav", () => {
  const indicator = document.querySelector<HTMLElement>(".scroll-progress")
  const bar = indicator?.querySelector<HTMLElement>(".scroll-progress-bar")
  const label = indicator?.querySelector<HTMLElement>(".scroll-progress-label")
  if (!indicator || !bar || !label) return

  let hideTimer: number | null = null
  let ticking = false

  function update() {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    const scrolled = window.scrollY
    const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrolled / docHeight) * 100)) : 0
    const rounded = Math.round(pct)
    bar!.style.width = `${pct}%`
    label!.textContent = `${rounded}%`

    indicator!.classList.add("visible")

    if (hideTimer !== null) {
      clearTimeout(hideTimer)
    }
    hideTimer = window.setTimeout(() => {
      indicator!.classList.remove("visible")
    }, HIDE_DELAY_MS)
  }

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      update()
      ticking = false
    })
  }

  window.addEventListener("scroll", onScroll, { passive: true })
  window.addCleanup(() => {
    window.removeEventListener("scroll", onScroll)
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  })
})
