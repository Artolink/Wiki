// @ts-ignore
import graphToggleScript from "./scripts/graphToggle.inline"
import styles from "./styles/graphToggle.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const GraphToggle: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <button
      class={classNames(displayClass, "graph-toggle")}
      title="Mostra/nascondi il grafo"
      aria-label="Mostra/nascondi il grafo"
    >
      {/* Icona "grafo" — semplice rappresentazione di nodi+archi */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <line x1="5" y1="6" x2="19" y2="6" />
        <line x1="5" y1="6" x2="12" y2="18" />
        <line x1="19" y1="6" x2="12" y2="18" />
      </svg>
    </button>
  )
}

GraphToggle.beforeDOMLoaded = graphToggleScript
GraphToggle.css = styles

export default (() => GraphToggle) satisfies QuartzComponentConstructor
