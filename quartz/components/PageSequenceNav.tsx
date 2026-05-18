import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import style from "./styles/pageSequenceNav.scss"

// Navigazione "Previous / Next" stile syselement — opt-in via frontmatter:
//
//   Pagina hub (es. _index.md o my-grafana-stack.md):
//     ---
//     series:
//       - my-grafana-stack
//       - observability/metrics/exporters/node-exporter
//       - observability/metrics/tsdb/victoriametrics
//       - ...
//     ---
//
// Le pagine elencate nell'array vedranno i bottoni Prev/Next basati sulla
// loro posizione. Le pagine non elencate non vedono nulla.
//
// Una pagina può apparire in più serie (raro): viene usata la PRIMA serie
// trovata iterando `allFiles`. L'ordine dei file è quello di build di
// Quartz — di solito alfabetico per slug.
const PageSequenceNav: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const currentSlug = fileData.slug
  if (!currentSlug) return null

  // Trova il primo file con un array `series` nel frontmatter che contiene
  // questo slug. Quel file è l'"hub" della serie.
  let hubSeries: string[] | null = null
  for (const f of allFiles) {
    const series = f.frontmatter?.series as unknown
    if (Array.isArray(series) && series.includes(currentSlug)) {
      hubSeries = series as string[]
      break
    }
  }
  if (!hubSeries) return null

  const idx = hubSeries.indexOf(currentSlug)
  if (idx < 0) return null

  const prevSlug = idx > 0 ? hubSeries[idx - 1] : null
  const nextSlug = idx < hubSeries.length - 1 ? hubSeries[idx + 1] : null

  const findPage = (slug: string) => allFiles.find((f) => f.slug === slug)
  const prevPage = prevSlug ? findPage(prevSlug) : null
  const nextPage = nextSlug ? findPage(nextSlug) : null

  // Se nessuna delle due, niente da mostrare (es. serie con un solo elemento).
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
