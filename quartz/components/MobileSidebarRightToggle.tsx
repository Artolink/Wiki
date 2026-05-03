// @ts-ignore
import script from "./scripts/mobileSidebarRightToggle.inline"
import styles from "./styles/mobileSidebarRightToggle.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const MobileSidebarRightToggle: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <button
      class={classNames(displayClass, "mobile-sidebar-right-toggle")}
      title="Apri il pannello laterale"
      aria-label="Apri il pannello laterale"
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
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <line x1="15" x2="15" y1="3" y2="21" />
        <path d="m8 9 3 3-3 3" />
      </svg>
    </button>
  )
}

MobileSidebarRightToggle.afterDOMLoaded = script
MobileSidebarRightToggle.css = styles

export default (() => MobileSidebarRightToggle) satisfies QuartzComponentConstructor
