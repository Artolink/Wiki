// @ts-ignore
import focusModeScript from "./scripts/focusmode.inline"
import styles from "./styles/focusmode.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const FocusMode: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <button class={classNames(displayClass, "focusmode")} title="Modalità focus">
      {/* Icona "nascondi sidebar" (3 colonne → visibile quando focus mode è OFF) */}
      <svg class="focus-on" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <rect x="1" y="3" width="4" height="18" rx="1" opacity="0.4"/>
        <rect x="7" y="3" width="10" height="18" rx="1"/>
        <rect x="19" y="3" width="4" height="18" rx="1" opacity="0.4"/>
      </svg>
      {/* Icona "ripristina sidebar" (1 colonna → visibile quando focus mode è ON) */}
      <svg class="focus-off" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <rect x="1" y="3" width="4" height="18" rx="1"/>
        <rect x="7" y="3" width="10" height="18" rx="1"/>
        <rect x="19" y="3" width="4" height="18" rx="1"/>
      </svg>
    </button>
  )
}

FocusMode.beforeDOMLoaded = focusModeScript
FocusMode.css = styles

export default (() => FocusMode) satisfies QuartzComponentConstructor
