// FontResizer: ridimensiona dinamicamente il testo dell'articolo centrale.
// Salva il valore in localStorage e lo applica come CSS variable --font-scale
// su <html>. Il CSS in custom.scss usa questa variabile sull'<article> centrale.

const STORAGE_KEY = "fontScale"
const MIN = 0.85
const MAX = 1.4
const STEP = 0.05
const DEFAULT = 1.0

function clamp(v: number): number {
  return Math.min(MAX, Math.max(MIN, v))
}

function readScale(): number {
  const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? "")
  return isNaN(v) ? DEFAULT : clamp(v)
}

function applyScale(scale: number) {
  document.documentElement.style.setProperty("--font-scale", String(scale))
}

function syncSliders(scale: number) {
  document.querySelectorAll<HTMLInputElement>(".font-resizer .font-slider").forEach((s) => {
    s.value = String(scale)
  })
}

function setScale(v: number) {
  const clamped = clamp(v)
  localStorage.setItem(STORAGE_KEY, String(clamped))
  applyScale(clamped)
  syncSliders(clamped)
}

// Applica lo stato salvato il prima possibile (idealmente in beforeDOMLoaded,
// ma il componente usa afterDOMLoaded — leggera latenza accettabile).
applyScale(readScale())

// Soglia di visibilità espressa come frazione dell'altezza del viewport,
// così la barra appare alla stessa "altezza relativa" su monitor di
// dimensioni diverse. 0.5 = il mouse deve superare la metà dello schermo
// (dal top) perché la barra entri in scena.
const VISIBLE_THRESHOLD_FRACTION = 0.5

document.addEventListener("nav", () => {
  const initial = readScale()
  applyScale(initial)
  syncSliders(initial)

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

    // Range orizzontale del contenuto: usiamo .center (column del file md).
    // Fallback su window.innerWidth se per qualche motivo manca (es. layout
    // diverso) → in quel caso il check X è disabilitato di fatto.
    const center = document.querySelector(".page > #quartz-body > .center")
    let overContent = true
    if (center) {
      const rect = (center as HTMLElement).getBoundingClientRect()
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

  // Slider: input event = update in tempo reale mentre l'utente trascina
  for (const slider of document.querySelectorAll<HTMLInputElement>(".font-resizer .font-slider")) {
    const onInput = (e: Event) => {
      const v = parseFloat((e.target as HTMLInputElement).value)
      setScale(v)
    }
    slider.addEventListener("input", onInput)
    window.addCleanup(() => slider.removeEventListener("input", onInput))
  }

  // Pulsante decrease (A piccolo)
  for (const btn of document.querySelectorAll(".font-resizer .font-decrease")) {
    const onClick = () => setScale(readScale() - STEP)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }

  // Pulsante increase (A grande)
  for (const btn of document.querySelectorAll(".font-resizer .font-increase")) {
    const onClick = () => setScale(readScale() + STEP)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }

  // Pulsante reset
  for (const btn of document.querySelectorAll(".font-resizer .font-reset")) {
    const onClick = () => setScale(DEFAULT)
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))
  }
})
