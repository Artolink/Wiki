import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import { classNames } from "../util/lang"
import style from "./styles/seriesIndex.scss"

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
      <h3>Index</h3>
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

export default (() => SeriesIndex) satisfies QuartzComponentConstructor
