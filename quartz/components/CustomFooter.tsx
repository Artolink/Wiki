import { pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// Footer minimale: una sola riga di copyright cliccabile che porta a
// /license. Stile (piccolo, grigio chiaro, centrato) in custom.scss.
const CustomFooter: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const baseDir = pathToRoot(fileData.slug!)
  return (
    <footer class={classNames(displayClass, "custom-footer")}>
      <a href={`${baseDir}/license`}>© Andrea Farneti, all rights reserved</a>
    </footer>
  )
}

export default (() => CustomFooter) satisfies QuartzComponentConstructor
