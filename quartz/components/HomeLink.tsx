import { pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

type HomeLinkOpts = {
  label?: string
  icon?: string
}

export default ((opts?: HomeLinkOpts) => {
  const label = opts?.label ?? "Home"
  const icon = opts?.icon ?? "🏠"

  const HomeLink: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const baseDir = pathToRoot(fileData.slug!)
    const isActive = fileData.slug === "index"
    return (
      <a
        class={classNames(displayClass, "home-link", isActive ? "active" : "")}
        href={baseDir}
      >
        <span class="home-link-icon" aria-hidden="true">{icon}</span>
        <span class="home-link-label">{label}</span>
      </a>
    )
  }

  HomeLink.css = `
.home-link {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  text-decoration: none;
  color: var(--dark);
  font-family: var(--bodyFont);
  font-size: 0.95rem;
  font-weight: 500;
  transition: background 0.15s ease;
  margin-bottom: 0.6rem;
}

.home-link:hover {
  background: var(--lightgray);
  text-decoration: none;
}

.home-link.active {
  background: var(--highlight);
  color: var(--secondary);
}

.home-link-icon {
  font-size: 1.05rem;
  line-height: 1;
}
`
  return HomeLink
}) satisfies QuartzComponentConstructor<HomeLinkOpts>
