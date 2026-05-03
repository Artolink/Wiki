// @ts-ignore
import script from "./scripts/mobileSidebarToggle.inline"
import styles from "./styles/mobileSidebarToggle.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const MobileSidebarToggle: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <button
      class={classNames(displayClass, "mobile-sidebar-toggle")}
      title="Apri il menu"
      aria-label="Apri il menu"
      aria-expanded="false"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  )
}

MobileSidebarToggle.afterDOMLoaded = script
MobileSidebarToggle.css = styles

export default (() => MobileSidebarToggle) satisfies QuartzComponentConstructor
