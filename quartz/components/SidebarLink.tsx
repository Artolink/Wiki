import { pathToRoot, joinSegments } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

type SidebarLinkOpts = {
  /** Etichetta visibile nel sidebar (es. "Graph view", "Starting Tools") */
  label: string
  /** Emoji o icona testuale (opzionale) */
  icon?: string
  /** Slug della pagina target (es. "graph", "starting-tools") */
  slug: string
}

export default ((opts: SidebarLinkOpts) => {
  const SidebarLink: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const baseDir = pathToRoot(fileData.slug!)
    const href = joinSegments(baseDir, opts.slug)
    const isActive = fileData.slug === opts.slug
    return (
      <a
        class={classNames(displayClass, "sidebar-link", isActive ? "active" : "")}
        href={href}
      >
        {opts.icon && (
          <span class="sidebar-link-icon" aria-hidden="true">
            {opts.icon}
          </span>
        )}
        <span class="sidebar-link-label">{opts.label}</span>
      </a>
    )
  }

  return SidebarLink
}) satisfies QuartzComponentConstructor<SidebarLinkOpts>
