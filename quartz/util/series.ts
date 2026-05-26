// Utility comune per il meccanismo "series" del wiki.
// Centralizza la logica di:
//   1. Trovare la series a cui appartiene una pagina (esplicita o derivata)
//   2. Costruire un array di slug per una "fullseries" auto-discovery
//
// Usato da: FolderContent, PageSequenceNav, SeriesIndex, SeriesIndexToggle.
// Prima della centralizzazione la logica era duplicata in 4 file con leggere
// variazioni — fix dolorose da tenere in sync.
//
// Due meccanismi supportati:
//
//   `series` (esplicito, array nel frontmatter):
//     ---
//     series:
//       - foo/bar
//       - foo/baz
//     ---
//   La pagina che dichiara `series` è l'hub; le pagine elencate sono i membri.
//
//   `fullseries` (auto-discovery, presente nel frontmatter di un _index):
//     ---
//     fullseries:
//     ---
//   L'_index che dichiara `fullseries` (anche vuota) diventa hub di una series
//   che include TUTTE le note sotto la sua cartella, ordinate alfabeticamente
//   (numeric:true, prefisso emoji stripped). Niente da elencare a mano.

import { simplifySlug, FullSlug, SimpleSlug } from "./path"
import { QuartzPluginData } from "../plugins/vfile"

// Pulisce il prefisso non-word (emoji + spazi) dai titoli per il sort.
// Stesso pattern usato in quartz.layout.ts explorerSortFn.
function stripLeading(s: string): string {
  return s.replace(/^[^\w]+/u, "")
}

// Confronto alfabetico-naturale (numeric:true) sul titolo strippato.
function compareTitles(a: QuartzPluginData, b: QuartzPluginData): number {
  const at = stripLeading((a.frontmatter?.title ?? a.slug ?? "").toLowerCase())
  const bt = stripLeading((b.frontmatter?.title ?? b.slug ?? "").toLowerCase())
  return at.localeCompare(bt, undefined, { numeric: true })
}

// Restituisce true se la pagina `member` vive sotto la cartella dell'_index `hub`.
// L'`hub` deve essere un _index (slug che termina con "/index"); folder = hub.slug
// senza il /index finale. `member` è incluso se il suo slug inizia con
// "<folder>/" (con trailing slash per evitare match parziali).
function isUnderIndex(memberSlug: FullSlug, hubFile: QuartzPluginData): boolean {
  const hubSlug = hubFile.slug ?? ""
  if (!hubSlug.endsWith("/index") && hubSlug !== "index") return false
  const folder = hubSlug === "index" ? "" : hubSlug.replace(/\/index$/, "")
  const prefix = folder === "" ? "" : folder + "/"
  return prefix === "" ? true : memberSlug.startsWith(prefix)
}

// Costruisce l'array di slug "public-style" per una fullseries hostata da `hub`.
// Include tutte le pagine sotto la cartella dell'hub, esclusi:
//   - l'hub stesso
//   - eventuali file di config/sistema (non rilevanti qui)
// Ordinati alfabeticamente per titolo (numeric:true, prefisso stripped).
export function buildFullseriesFor(
  hub: QuartzPluginData,
  allFiles: QuartzPluginData[],
): string[] {
  const hubSlug = hub.slug ?? ""
  return allFiles
    .filter((f) => {
      if (!f.slug) return false
      if (f.slug === hubSlug) return false // escludi l'_index hub stesso
      return isUnderIndex(f.slug, hub)
    })
    .sort(compareTitles)
    // Stessa normalizzazione di findSeriesForPage qui sotto: per sotto-_index
    // simplifySlug lascerebbe lo slash finale ("foo/bar/") e il successivo
    // matchSlug non li riconoscerebbe più.
    .map((f) => (simplifySlug(f.slug as FullSlug) as string).replace(/\/$/, ""))
}

// Trova la series a cui appartiene la pagina `current`, se presente.
// Restituisce l'array di slug della series (in ordine), o null se la pagina
// non fa parte di nessuna series.
//
// L'ordine di lookup:
//   1. Se `current` ha `series` array nel proprio frontmatter → è hub esplicito
//   2. Se `current` ha `fullseries` (anche vuota) → è hub auto-discovery
//   3. Cerca in `allFiles` qualcuno con `series` array che contiene `current.slug`
//   4. Cerca in `allFiles` qualche _index con `fullseries` di cui `current` è
//      figlio (vive sotto la sua cartella)
//
// Il match flessibile su slug copre il caso comune in cui l'utente scrive nel
// frontmatter lo slug "pubblico" (es. "foo/bar") mentre Quartz internamente
// usa lo slug "interno" per le _index (es. "foo/bar/index").
export function findSeriesForPage(
  current: QuartzPluginData,
  allFiles: QuartzPluginData[],
): string[] | null {
  const currentFullSlug = current.slug
  if (!currentFullSlug) return null

  // NB: NON usiamo `simplifySlug` qui — quella utility di Quartz core, dopo
  // aver tolto il suffix "index", lascia lo slash finale (es. "foo/bar/index"
  // → "foo/bar/"), che poi non matcha mai "foo/bar" come scritto a mano nel
  // frontmatter `series:` di un'altra pagina. La conseguenza è che le pagine
  // `_index` membre di una series non venivano più riconosciute come tali e
  // FolderContent/PageSequenceNav si comportavano come se non lo fossero.
  // Stessa normalizzazione che fa PageSequenceNav.tsx.
  const publicSlug = currentFullSlug.replace(/\/index$/, "")
  const matchSlug = (s: string) => s === currentFullSlug || s === publicSlug

  // 1. Esplicita: own series array
  const ownSeries = current.frontmatter?.series as unknown
  if (Array.isArray(ownSeries) && ownSeries.length > 0) {
    return ownSeries as string[]
  }

  // 2. Auto-discovery: own fullseries (la chiave c'è, valore irrilevante)
  if (current.frontmatter && "fullseries" in current.frontmatter) {
    return buildFullseriesFor(current, allFiles)
  }

  // 3 + 4. Cerca un hub altrui
  for (const f of allFiles) {
    if (f.slug === currentFullSlug) continue

    // 3. f ha un series array che ci include
    const fSeries = f.frontmatter?.series as unknown
    if (Array.isArray(fSeries) && (fSeries as string[]).some(matchSlug)) {
      return fSeries as string[]
    }

    // 4. f è un _index con fullseries e noi siamo sotto la sua cartella
    if (f.frontmatter && "fullseries" in f.frontmatter && isUnderIndex(currentFullSlug, f)) {
      return buildFullseriesFor(f, allFiles)
    }
  }

  return null
}
