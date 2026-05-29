// Resizer floating: due controlli su due righe.
//   1) FONT — ridimensiona il testo dell'articolo via CSS variable
//      `--font-scale` su <html>; il CSS in custom.scss la usa con calc().
//   2) PAGE WIDTH — ridimensiona il container `.page` via CSS variable
//      `--page-max-width` su <html>; il selettore in base.scss la legge con
//      fallback al default Quartz (1500px).
//
// Entrambi i valori sono persistiti in localStorage e ri-applicati a ogni
// navigazione SPA-style (event "nav") e al primo paint.

// ── Stato: FONT ──────────────────────────────────────────────────────────────
const FONT_KEY = "fontScale"
const FONT_MIN = 0.85
const FONT_MAX = 1.4
const FONT_STEP = 0.05
const FONT_DEFAULT = 1.0

// ── Stato: PAGE WIDTH (px) ───────────────────────────────────────────────────
// La var `--page-max-width` viene letta da `.center > article` (e fratelli)
// in custom.scss. La var `--sidebar-width` viene letta dal grid-template-columns
// del #quartz-body (override in custom.scss): quando l'article cresce, le due
// sidebar si restringono dello stesso "delta diviso 2", così l'article cresce
// **da entrambi i lati** rispetto al centro del viewport invece che dentro un
// `.center` cell fissa (che lo "incollerebbe" al bordo sx quando supera il cell).
//
// MIN = larghezza attuale (860px) — sotto, lo slider non avrebbe effetto.
// MAX = limite oltre cui le sidebar diventerebbero troppo strette per essere
//       leggibili (200px min). 860 + (380-200)*2 = 1220 è il punto in cui le
//       sidebar arrivano al minimo; oltre lo slider può continuare ad agire
//       solo sul max-width dell'article (utile su monitor ultrawide).
const WIDTH_KEY = "pageWidth"
const WIDTH_MIN = 860
const WIDTH_MAX = 1400
const WIDTH_STEP = 40
const WIDTH_DEFAULT = 860
const SIDEBAR_DEFAULT = 380
const SIDEBAR_MIN = 200

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

// ── FONT ─────────────────────────────────────────────────────────────────────
function readScale(): number {
  const v = parseFloat(localStorage.getItem(FONT_KEY) ?? "")
  return isNaN(v) ? FONT_DEFAULT : clamp(v, FONT_MIN, FONT_MAX)
}
function applyScale(scale: number) {
  document.documentElement.style.setProperty("--font-scale", String(scale))
}
function syncFontSliders(scale: number) {
  document.querySelectorAll<HTMLInputElement>(".font-resizer .font-slider").forEach((s) => {
    s.value = String(scale)
  })
}
function setScale(v: number) {
  const c = clamp(v, FONT_MIN, FONT_MAX)
  localStorage.setItem(FONT_KEY, String(c))
  applyScale(c)
  syncFontSliders(c)
}

// ── PAGE WIDTH ───────────────────────────────────────────────────────────────
function readWidth(): number {
  const v = parseFloat(localStorage.getItem(WIDTH_KEY) ?? "")
  return isNaN(v) ? WIDTH_DEFAULT : clamp(v, WIDTH_MIN, WIDTH_MAX)
}
function applyWidth(px: number) {
  document.documentElement.style.setProperty("--page-max-width", `${px}px`)
  // Restringi le sidebar dello stesso "delta / 2" che il contenuto cresce,
  // così il centro visivo dell'article rimane ancorato al centro del viewport
  // e l'allargamento è davvero simmetrico (non solo dentro un .center fisso).
  // SIDEBAR_MIN evita che le sidebar diventino inservibili a slider massimo.
  const delta = Math.max(0, px - WIDTH_MIN)
  const newSidebar = Math.max(SIDEBAR_MIN, SIDEBAR_DEFAULT - delta / 2)
  document.documentElement.style.setProperty("--sidebar-width", `${newSidebar}px`)
}
function syncWidthSliders(px: number) {
  document.querySelectorAll<HTMLInputElement>(".font-resizer .width-slider").forEach((s) => {
    s.value = String(px)
  })
}
function setWidth(v: number) {
  const c = clamp(v, WIDTH_MIN, WIDTH_MAX)
  localStorage.setItem(WIDTH_KEY, String(c))
  applyWidth(c)
  syncWidthSliders(c)
}

// Applica subito lo stato salvato (no flash di layout default → utente).
applyScale(readScale())
applyWidth(readWidth())

// Soglia di visibilità espressa come frazione dell'altezza del viewport,
// così la barra appare alla stessa "altezza relativa" su monitor di
// dimensioni diverse. 0.5 = il mouse deve superare la metà dello schermo
// (dal top) perché la barra entri in scena.
const VISIBLE_THRESHOLD_FRACTION = 0.5

document.addEventListener("nav", () => {
  const initFont = readScale()
  const initWidth = readWidth()
  applyScale(initFont)
  applyWidth(initWidth)
  syncFontSliders(initFont)
  syncWidthSliders(initWidth)

  // ── Visibilità floating: appare solo se il mouse è sopra al contenuto ──
  // Vincoli combinati:
  //   1) puntatore sotto la soglia verticale (metà schermo, vedi
  //      VISIBLE_THRESHOLD_FRACTION) → non distrae mentre leggi l'inizio.
  //   2) puntatore sopra al .center (la colonna del file md) → su finestre
  //      larghe, le aree vuote ai lati delle sidebar non attivano la barra.
  // La barra è position:fixed in basso al centro, opacity:0 di default;
  // toggle della classe `.visible` controlla la transizione opacity. Throttle
  // dei mousemove via requestAnimationFrame.
  let mouseTracking = false
  function updateVisibility(mouseX: number, mouseY: number) {
    const threshold = window.innerHeight * VISIBLE_THRESHOLD_FRACTION
    const belowMidpoint = mouseY > threshold

    const article =
      document.querySelector(".page > #quartz-body > .center article") ||
      document.querySelector(".page > #quartz-body > .center")
    let overContent = true
    if (article) {
      const rect = (article as HTMLElement).getBoundingClientRect()
      overContent = mouseX >= rect.left && mouseX <= rect.right
    }

    const shouldBeVisible = belowMidpoint && overContent
    for (const el of document.getElementsByClassName("font-resizer-floating")) {
      el.classList.toggle("visible", shouldBeVisible)
    }
  }
  function onMouseMove(e: MouseEvent) {
    if (mouseTracking) return
    mouseTracking = true
    const x = e.clientX
    const y = e.clientY
    requestAnimationFrame(() => {
      updateVisibility(x, y)
      mouseTracking = false
    })
  }
  document.addEventListener("mousemove", onMouseMove, { passive: true })
  window.addCleanup(() => document.removeEventListener("mousemove", onMouseMove))

  // ── FONT controls ───────────────────────────────────────────────────────
  for (const slider of document.querySelectorAll<HTMLInputElement>(".font-resizer .font-slider")) {
    const onInput = (e: Event) => setScale(parseFloat((e.target as HTMLInputElement).value))
    slider.addEventListener("input", onInput)
    window.addCleanup(() => slider.removeEventListener("input", onInput))
  }
  for (const btn of document.querySelectorAll(".font-resizer .font-decrease")) {
    const onClick = () => setScale(readScale() - FONT_STEP)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }
  for (const btn of document.querySelectorAll(".font-resizer .font-increase")) {
    const onClick = () => setScale(readScale() + FONT_STEP)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }
  for (const btn of document.querySelectorAll(".font-resizer .font-reset")) {
    const onClick = () => setScale(FONT_DEFAULT)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }

  // ── WIDTH controls ──────────────────────────────────────────────────────
  for (const slider of document.querySelectorAll<HTMLInputElement>(".font-resizer .width-slider")) {
    const onInput = (e: Event) => setWidth(parseFloat((e.target as HTMLInputElement).value))
    slider.addEventListener("input", onInput)
    window.addCleanup(() => slider.removeEventListener("input", onInput))
  }
  for (const btn of document.querySelectorAll(".font-resizer .width-decrease")) {
    const onClick = () => setWidth(readWidth() - WIDTH_STEP)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }
  for (const btn of document.querySelectorAll(".font-resizer .width-increase")) {
    const onClick = () => setWidth(readWidth() + WIDTH_STEP)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }
  for (const btn of document.querySelectorAll(".font-resizer .width-reset")) {
    const onClick = () => setWidth(WIDTH_DEFAULT)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }
})
