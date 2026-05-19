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

  // Quartz internamente usa `<path>/index` come slug per gli _index.md di
  // cartella, ma l'URL pubblico è `<path>` (senza /index). L'utente
  // probabilmente scrive lo slug pubblico nel frontmatter `series:`, quindi
  // facciamo match flessibile su entrambe le forme. Vedi anche FolderContent.tsx.
  const publicSlug = currentSlug.replace(/\/index$/, "")
  const matchSlug = (s: string) => s === currentSlug || s === publicSlug

  // findPage: stesso fallback `/index` di FolderContent — accetta sia slug
  // "pubblico" che slug "interno" Quartz.
  const findPage = (slug: string) =>
    allFiles.find((f) => f.slug === slug) ??
    allFiles.find((f) => f.slug === `${slug}/index`)

  // CASO 1 — Questa pagina è l'HUB di una series (ha `series: [...]` nel suo
  // frontmatter). Mostra un solo bottone Next che porta alla prima pagina
  // della series. Nessun Previous perché l'hub è il "punto di ingresso".
  const ownSeries = fileData.frontmatter?.series as unknown
  if (Array.isArray(ownSeries) && (ownSeries as string[]).length > 0) {
    const firstSlug = (ownSeries as string[])[0]
    const firstPage = findPage(firstSlug)
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

  // CASO 2 — Questa pagina è MEMBRO di una series (il suo slug compare nel
  // `series:` di un'altra pagina). Trova quell'hub, calcola la posizione,
  // mostra Prev + Next basati sui vicini nell'array.
  let hubSeries: string[] | null = null
  for (const f of allFiles) {
    const series = f.frontmatter?.series as unknown
    if (Array.isArray(series) && (series as string[]).some(matchSlug)) {
      hubSeries = series as string[]
      break
    }
  }
  if (!hubSeries) return null

  // Cerca la posizione con entrambe le forme; vince la prima che trova
  const idx = hubSeries.findIndex(matchSlug)
  if (idx < 0) return null

  const prevSlug = idx > 0 ? hubSeries[idx - 1] : null
  const nextSlug = idx < hubSeries.length - 1 ? hubSeries[idx + 1] : null
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
