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

// Soglia (px dal fondo del viewport) entro cui la barra diventa visibile
const VISIBLE_THRESHOLD_PX = 110

document.addEventListener("nav", () => {
  const initial = readScale()
  applyScale(initial)
  syncSliders(initial)

  // ── Visibilità floating: appare quando il mouse è vicino al bordo basso ──
  // La barra è position:fixed in basso al centro, opacity:0 di default.
  // Aggiungiamo `.visible` quando il puntatore entra negli ultimi N pixel del
  // viewport, e la rimuoviamo altrimenti. Throttle via requestAnimationFrame.
  let mouseTracking = false
  function updateVisibility(mouseY: number) {
    const distFromBottom = window.innerHeight - mouseY
    const shouldBeVisible = distFromBottom < VISIBLE_THRESHOLD_PX
    for (const el of document.getElementsByClassName("font-resizer-floating")) {
      el.classList.toggle("visible", shouldBeVisible)
    }
  }
  function onMouseMove(e: MouseEvent) {
    if (mouseTracking) return
    mouseTracking = true
    requestAnimationFrame(() => {
      updateVisibility(e.clientY)
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
