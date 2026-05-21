import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import { findSeriesForPage } from "../util/series"
import style from "./styles/pageSequenceNav.scss"

// Navigazione "Previous / Next" stile syselement — opt-in via frontmatter.
// Vedi quartz/util/series.ts per la logica di lookup della series.
//
// Due meccanismi:
//   `series: [a, b, c, ...]` — esplicito, ordine controllato a mano
//   `fullseries:`           — auto-discovery: tutte le note sotto la cartella
//                              dell'_index hostante, in ordine alfabetico
//
// Tre stati possibili per il rendering:
//   - HUB esplicito (la pagina ha `series` array)                → solo bottone "Start the series" verso il primo membro
//   - HUB auto-discovery (la pagina è _index con `fullseries`)   → idem
//   - MEMBRO di una series                                       → Prev + Next basati sui vicini nell'array
//   - non-membro                                                  → null
const PageSequenceNav: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const currentSlug = fileData.slug
  if (!currentSlug) return null

  const publicSlug = currentSlug.replace(/\/index$/, "")
  const matchSlug = (s: string) => s === currentSlug || s === publicSlug

  // findPage: stesso fallback `/index` di FolderContent — accetta slug
  // "pubblico" o "interno" Quartz.
  const findPage = (slug: string) =>
    allFiles.find((f) => f.slug === slug) ??
    allFiles.find((f) => f.slug === `${slug}/index`)

  // È la pagina un HUB? (esplicito o auto-discovery)
  const fmHasSeries =
    Array.isArray(fileData.frontmatter?.series) &&
    (fileData.frontmatter?.series as unknown[]).length > 0
  const fmHasFullseries =
    fileData.frontmatter !== undefined && "fullseries" in fileData.frontmatter
  const isHub = fmHasSeries || fmHasFullseries

  const series = findSeriesForPage(fileData, allFiles)
  if (!series) return null

  // CASO 1 — HUB: solo Next verso il primo membro della series.
  if (isHub) {
    const firstSlug = series[0]
    const firstPage = firstSlug ? findPage(firstSlug) : null
    if (!firstPage) return null

    return (
      <nav class="page-sequence-nav" aria-label="Series navigation">
        <span class="page-sequence-link disabled" aria-hidden="true" />
        <a
          class="page-sequence-link next"
          href={resolveRelative(currentSlug, firstPage.slug as FullSlug)}
        >
          <span class="content">
            <span class="label">Start the series</span>
            <span class="title">{firstPage.frontmatter?.title ?? firstPage.slug}</span>
          </span>
          <span class="arrow" aria-hidden="true">
            ›
          </span>
        </a>
      </nav>
    )
  }

  // CASO 2 — MEMBRO: Prev + Next basati sulla posizione nella series.
  const idx = series.findIndex(matchSlug)
  if (idx < 0) return null

  const prevSlug = idx > 0 ? series[idx - 1] : null
  const nextSlug = idx < series.length - 1 ? series[idx + 1] : null
  const prevPage = prevSlug ? findPage(prevSlug) : null
  const nextPage = nextSlug ? findPage(nextSlug) : null

  if (!prevPage && !nextPage) return null

  return (
    <nav class="page-sequence-nav" aria-label="Series navigation">
      {prevPage ? (
        <a
          class="page-sequence-link prev"
          href={resolveRelative(currentSlug, prevPage.slug as FullSlug)}
        >
          <span class="arrow" aria-hidden="true">
            ‹
          </span>
          <span class="content">
            <span class="label">Previous</span>
            <span class="title">{prevPage.frontmatter?.title ?? prevPage.slug}</span>
          </span>
        </a>
      ) : (
        <span class="page-sequence-link disabled" aria-hidden="true" />
      )}

      {nextPage ? (
        <a
          class="page-sequence-link next"
          href={resolveRelative(currentSlug, nextPage.slug as FullSlug)}
        >
          <span class="content">
            <span class="label">Next</span>
            <span class="title">{nextPage.frontmatter?.title ?? nextPage.slug}</span>
          </span>
          <span class="arrow" aria-hidden="true">
            ›
          </span>
        </a>
      ) : (
        <span class="page-sequence-link disabled" aria-hidden="true" />
      )}
    </nav>
  )
}

PageSequenceNav.css = style

export default (() => PageSequenceNav) satisfies QuartzComponentConstructor
