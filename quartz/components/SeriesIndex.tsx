import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import { classNames } from "../util/lang"
import { findSeriesForPage } from "../util/series"
import style from "./styles/seriesIndex.scss"
// @ts-ignore
import script from "./scripts/seriesIndex.inline"

// Sidebar "Index" — mostra l'indice della series a cui appartiene la pagina
// corrente (sia che ne sia l'HUB che un MEMBER). L'item corrispondente alla
// pagina attuale è evidenziato (classe `.active`).
//
// Non rende nulla per le pagine che NON fanno parte di alcuna series — il
// componente è sempre montato nel layout ma return null quando non ha senso.
const SeriesIndex: QuartzComponent = ({
  fileData,
  allFiles,
  displayClass,
}: QuartzComponentProps) => {
  const currentSlug = fileData.slug
  if (!currentSlug) return null

  // Lookup della series (esplicita o auto-discovery via fullseries)
  // centralizzato in quartz/util/series.ts. Vedi la doc lì per il contratto.
  const publicSlug = currentSlug.replace(/\/index$/, "")
  const matchSlug = (s: string) => s === currentSlug || s === publicSlug

  const findPage = (slug: string) =>
    allFiles.find((f) => f.slug === slug) ??
    allFiles.find((f) => f.slug === `${slug}/index`)

  const series = findSeriesForPage(fileData, allFiles)
  if (!series) return null

  return (
    <div class={classNames(displayClass, "series-index")}>
      <button type="button" class="series-index-header" aria-expanded="true">
        <h3>Index</h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="fold"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <ol class="series-index-list">
        {series.map((slug) => {
          const page = findPage(slug)
          if (!page) return null
          const isActive = matchSlug(slug)
          const title = page.frontmatter?.title ?? page.slug
          return (
            <li class={isActive ? "active" : ""}>
              <a
                href={resolveRelative(currentSlug, page.slug as FullSlug)}
                class={isActive ? "active" : "internal"}
              >
                {title}
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

SeriesIndex.css = style
SeriesIndex.afterDOMLoaded = script

export default (() => SeriesIndex) satisfies QuartzComponentConstructor
