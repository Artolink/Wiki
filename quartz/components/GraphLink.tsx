import { pathToRoot, joinSegments } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

type GraphLinkOpts = {
  label?: string
  icon?: string
  /** Slug della pagina dedicata al grafo (default: "grafico") */
  slug?: string
}

export default ((opts?: GraphLinkOpts) => {
  const label = opts?.label ?? "Vista grafo"
  const icon = opts?.icon ?? "🕸️"
  const targetSlug = opts?.slug ?? "grafico"

  const GraphLink: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const baseDir = pathToRoot(fileData.slug!)
    const href = joinSegments(baseDir, targetSlug)
    const isActive = fileData.slug === targetSlug
    return (
      <a
        class={classNames(displayClass, "graph-link", isActive ? "active" : "")}
        href={href}
      >
        <span class="graph-link-icon" aria-hidden="true">{icon}</span>
        <span class="graph-link-label">{label}</span>
      </a>
    )
  }

  return GraphLink
}) satisfies QuartzComponentConstructor<GraphLinkOpts>
