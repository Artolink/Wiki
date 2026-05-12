// @ts-ignore
import script from "./scripts/pageProgress.inline"
import styles from "./styles/pageProgress.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// Widget di progress completamento pagina: conta le checkbox spuntate nel
// content e mostra una pillola floating in basso-centro (sopra al FontResizer).
// Logica in scripts/pageProgress.inline.ts; stile in styles/pageProgress.scss.
// Si nasconde automaticamente se la pagina non contiene checkbox.
const PageProgress: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <div
      class={classNames(displayClass, "page-progress")}
      data-progress-visible="false"
      role="status"
      aria-live="polite"
    >
      <div class="page-progress-pill">
        <span class="page-progress-counter">0/0</span>
        <span class="page-progress-bar" aria-hidden="true">
          <span class="page-progress-bar-fill"></span>
        </span>
        <span class="page-progress-percent">0%</span>
        <span class="page-progress-tick" aria-hidden="true">✓</span>
      </div>
    </div>
  )
}

PageProgress.afterDOMLoaded = script
PageProgress.css = styles

export default (() => PageProgress) satisfies QuartzComponentConstructor
