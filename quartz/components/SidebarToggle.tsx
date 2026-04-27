// @ts-ignore
import sidebarToggleScript from "./scripts/sidebarToggle.inline"
import styles from "./styles/sidebarToggle.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const SidebarToggle: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <button
      class={classNames(displayClass, "sidebar-toggle")}
      title="Mostra/nascondi il menu di sinistra"
      aria-label="Mostra/nascondi il menu di sinistra"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}

SidebarToggle.beforeDOMLoaded = sidebarToggleScript
SidebarToggle.css = styles

export default (() => SidebarToggle) satisfies QuartzComponentConstructor
