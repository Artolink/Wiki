// @ts-ignore
import fontResizerScript from "./scripts/fontResizer.inline"
import styles from "./styles/fontResizer.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const FontResizer: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <div
      class={classNames(displayClass, "font-resizer")}
      role="group"
      aria-label="Dimensione testo"
    >
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
  )
}

FontResizer.afterDOMLoaded = fontResizerScript
FontResizer.css = styles

export default (() => FontResizer) satisfies QuartzComponentConstructor
