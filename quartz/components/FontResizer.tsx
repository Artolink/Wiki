// @ts-ignore
import fontResizerScript from "./scripts/fontResizer.inline"
import styles from "./styles/fontResizer.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// Resizer floating: due controlli affiancati su due righe.
//   Riga 1: font-size del corpo del testo (A piccola ↔ slider ↔ A grande ↔ reset)
//   Riga 2: larghezza della pagina (.page) — utile su monitor wide/4K dove
//           il default 860px lascia banding bianco ai lati del contenuto.
//           Slider tra MIN 860 e MAX 1600 — il max DEVE coincidere con
//           WIDTH_MAX in fontResizer.inline.ts, e (max-min) deve essere un
//           multiplo dello step, o la maniglia non raggiunge il fondo track.
const FontResizer: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <div class={classNames(displayClass, "font-resizer-floating")}>
      <div
        class="font-resizer"
        role="group"
        aria-label="Personalizzazione layout"
      >
        {/* ── Riga 1: font ───────────────────────────────────────────────── */}
        <div class="resizer-row resizer-row-font" role="group" aria-label="Dimensione testo">
          <button
            type="button"
            class="font-decrease"
            title="Diminuisci dimensione testo"
            aria-label="Diminuisci dimensione testo"
          >
            <span class="font-icon font-icon-small">A</span>
          </button>
          <input
            type="range"
            class="font-slider"
            min="0.85"
            max="1.4"
            step="0.05"
            defaultValue="1"
            aria-label="Dimensione testo"
          />
          <button
            type="button"
            class="font-increase"
            title="Aumenta dimensione testo"
            aria-label="Aumenta dimensione testo"
          >
            <span class="font-icon font-icon-large">A</span>
          </button>
          <button
            type="button"
            class="font-reset"
            title="Reset dimensione testo"
            aria-label="Reset dimensione testo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
            </svg>
          </button>
        </div>

        {/* ── Riga 2: larghezza pagina ───────────────────────────────────── */}
        <div class="resizer-row resizer-row-width" role="group" aria-label="Larghezza pagina">
          <button
            type="button"
            class="width-decrease"
            title="Restringi larghezza pagina"
            aria-label="Restringi larghezza pagina"
          >
            {/* Frecce ›‹ verso il centro = shrink */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 5 13 12 6 19" />
              <polyline points="18 5 11 12 18 19" />
            </svg>
          </button>
          <input
            type="range"
            class="width-slider"
            min="860"
            max="1600"
            step="20"
            defaultValue="860"
            aria-label="Larghezza pagina"
          />
          <button
            type="button"
            class="width-increase"
            title="Allarga pagina"
            aria-label="Allarga pagina"
          >
            {/* Frecce ‹› verso fuori = expand */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="13 5 20 12 13 19" />
              <polyline points="11 5 4 12 11 19" />
            </svg>
          </button>
          <button
            type="button"
            class="width-reset"
            title="Reset larghezza pagina"
            aria-label="Reset larghezza pagina"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

FontResizer.afterDOMLoaded = fontResizerScript
FontResizer.css = styles

export default (() => FontResizer) satisfies QuartzComponentConstructor
