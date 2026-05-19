import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import { classNames } from "../util/lang"
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

  // Same flexible-slug logic come PageSequenceNav e FolderContent: lo slug
  // del frontmatter può essere "public" (es. `foo/bar`) o "interno"
  // (`foo/bar/index`). Match e lookup tollerano entrambe le forme.
  const publicSlug = currentSlug.replace(/\/index$/, "")
  const matchSlug = (s: string) => s === currentSlug || s === publicSlug

  const findPage = (slug: string) =>
    allFiles.find((f) => f.slug === slug) ??
    allFiles.find((f) => f.slug === `${slug}/index`)

  // Trova la series rilevante per questa pagina:
  // 1) Se la pagina è HUB (ha `series:` nel suo frontmatter) → usa quello
  // 2) Altrimenti cerca in tutti gli altri file un `series:` che contenga
  //    il currentSlug.
  let series: string[] | null = null

  const ownSeries = fileData.frontmatter?.series as unknown
  if (Array.isArray(ownSeries) && (ownSeries as string[]).length > 0) {
    series = ownSeries as string[]
  } else {
    for (const f of allFiles) {
      const s = f.frontmatter?.series as unknown
      if (Array.isArray(s) && (s as string[]).some(matchSlug)) {
        series = s as string[]
        break
      }
    }
  }

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
