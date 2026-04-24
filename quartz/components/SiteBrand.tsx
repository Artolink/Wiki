import { pathToRoot, joinSegments } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

const SiteBrand: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  const iconPath = joinSegments(baseDir, "static/icon.png")
  return (
    <a class={classNames(displayClass, "site-brand")} href={baseDir} aria-label={title}>
      <img class="site-brand-logo" src={iconPath} alt="" />
      <span class="site-brand-name">{title}</span>
    </a>
  )
}

SiteBrand.css = `
.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: inherit;
  white-space: nowrap;
}

.site-brand:hover {
  text-decoration: none;
}

.site-brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.site-brand-name {
  font-family: var(--titleFont);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--dark);
}
`

export default (() => SiteBrand) satisfies QuartzComponentConstructor
