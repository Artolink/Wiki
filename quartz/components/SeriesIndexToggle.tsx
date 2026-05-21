import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import { classNames } from "../util/lang"
import { findSeriesForPage } from "../util/series"
import style from "./styles/seriesIndexToggle.scss"
// @ts-ignore
import script from "./scripts/seriesIndexToggle.inline"

// Pulsante "libro" nella topbar che apre un popup con l'indice della series
// a cui appartiene la pagina corrente. Renderizza nulla se la pagina non è
// parte di alcuna series.
const SeriesIndexToggle: QuartzComponent = ({
  fileData,
  allFiles,
  displayClass,
}: QuartzComponentProps) => {
  const currentSlug = fileData.slug
  if (!currentSlug) return null

  // Lookup centralizzato (esplicito o fullseries) — vedi util/series.ts.
  const publicSlug = currentSlug.replace(/\/index$/, "")
  const matchSlug = (s: string) => s === currentSlug || s === publicSlug

  const findPage = (slug: string) =>
    allFiles.find((f) => f.slug === slug) ??
    allFiles.find((f) => f.slug === `${slug}/index`)

  const series = findSeriesForPage(fileData, allFiles)
  if (!series) return null

  return (
    <div class={classNames(displayClass, "series-index-toggle")}>
      <button
        type="button"
        class="series-index-toggle-btn"
        aria-label="Toggle series index"
        aria-expanded="false"
      >
        {/* Icona libro (feather-icons / lucide "book-open") */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
      </button>
      <div class="series-index-popup" role="menu" aria-hidden="true">
        <p class="series-index-popup-title">Index</p>
        <ol class="series-index-popup-list">
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
    </div>
  )
}

SeriesIndexToggle.css = style
SeriesIndexToggle.afterDOMLoaded = script

export default (() => SeriesIndexToggle) satisfies QuartzComponentConstructor
