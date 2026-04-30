// @ts-ignore
import scrollProgressScript from "./scripts/scrollProgress.inline"
import styles from "./styles/scrollProgress.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const ScrollProgress: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <div class={classNames(displayClass, "scroll-progress")} aria-hidden="true">
      <div class="scroll-progress-bar"></div>
      <div class="scroll-progress-label">0%</div>
    </div>
  )
}

ScrollProgress.afterDOMLoaded = scrollProgressScript
ScrollProgress.css = styles

export default (() => ScrollProgress) satisfies QuartzComponentConstructor
