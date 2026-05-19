import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { isFolderPath } from "../../util/path"

// Ordinamento alfabetico per titolo, con cartelle in cima (stessa convenzione
// di `byDateAndAlphabeticalFolderFirst` in PageList.tsx). `numeric: true`
// abilita il "natural sort": "0. Pre-upgrade", "1. Patch", "2. Post-upgrade"
// vengono ordinati correttamente invece di "0., 1., 10., 2., 3.".
const alphabeticalFolderFirst: SortFn = (a, b) => {
  const aIsFolder = isFolderPath(a.slug ?? "")
  const bIsFolder = isFolderPath(b.slug ?? "")
  if (aIsFolder && !bIsFolder) return -1
  if (!aIsFolder && bIsFolder) return 1

  const aTitle = (a.frontmatter?.title ?? a.slug ?? "").toLowerCase()
  const bTitle = (b.frontmatter?.title ?? b.slug ?? "").toLowerCase()
  return aTitle.localeCompare(bTitle, undefined, { numeric: true })
}

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    // Modalità "series": se il frontmatter dell'_index dichiara un array
    // `series: [...]` con gli slug delle pagine della serie, mostra QUELLA
    // lista (nell'ordine dichiarato) invece dell'auto-listing dei figli
    // della cartella. Le pagine non trovate (slug obsoleti) vengono silenziosamente
    // skippate. Utile per pagine di indice che curano un percorso di lettura
    // ordinato (es. la stack di Grafana: exporter → tsdb → scraper → grafana).
    const seriesSlugs = fileData.frontmatter?.series as string[] | undefined
    const isSeries = Array.isArray(seriesSlugs) && seriesSlugs.length > 0

    // "Membro di una serie altrui": questa _index è ELENCATA in un'altra
    // pagina con `series:` (es. l'_index della cartella `exporters` è
    // menzionato nella series dell'_index di `metrics`). In quel caso il
    // listing automatico della cartella non serve — la pagina ha già i
    // bottoni Prev/Next a fondo pagina (vedi PageSequenceNav) e il listing
    // delle children è ridondante / fuorviante (suggerisce un percorso
    // diverso da quello della series).
    const currentSlug = fileData.slug
    const publicSlug = currentSlug?.replace(/\/index$/, "")
    const isMemberOfSeries =
      !!currentSlug &&
      allFiles.some((f) => {
        if (f.slug === currentSlug) return false // skip self
        const series = f.frontmatter?.series as unknown
        if (!Array.isArray(series)) return false
        return (series as string[]).some((s) => s === currentSlug || s === publicSlug)
      })
    // Match flessibile: lo slug del frontmatter può essere il "public" slug
    // (es. `observability/metrics/exporters`, come appare nell'URL del sito)
    // mentre Quartz internamente registra l'_index.md come
    // `observability/metrics/exporters/index`. Tentiamo entrambe le forme,
    // così l'utente può scrivere quello che vede nel browser senza pensarci.
    const seriesPages: QuartzPluginData[] = isSeries
      ? seriesSlugs!
          .map(
            (slug) =>
              allFiles.find((f) => f.slug === slug) ??
              allFiles.find((f) => f.slug === `${slug}/index`),
          )
          .filter((p): p is QuartzPluginData => p !== undefined)
      : []

    const allPagesInFolder: QuartzPluginData[] =
      folder.children
        .map((node) => {
          // regular file, proceed
          if (node.data) {
            return node.data
          }

          if (node.isFolder && options.showSubfolders) {
            // folders that dont have data need synthetic files
            const getMostRecentDates = (): QuartzPluginData["dates"] => {
              let maybeDates: QuartzPluginData["dates"] | undefined = undefined
              for (const child of node.children) {
                if (child.data?.dates) {
                  // compare all dates and assign to maybeDates if its more recent or its not set
                  if (!maybeDates) {
                    maybeDates = { ...child.data.dates }
                  } else {
                    if (child.data.dates.created > maybeDates.created) {
                      maybeDates.created = child.data.dates.created
                    }

                    if (child.data.dates.modified > maybeDates.modified) {
                      maybeDates.modified = child.data.dates.modified
                    }

                    if (child.data.dates.published > maybeDates.published) {
                      maybeDates.published = child.data.dates.published
                    }
                  }
                }
              }
              return (
                maybeDates ?? {
                  created: new Date(),
                  modified: new Date(),
                  published: new Date(),
                }
              )
            }

            return {
              slug: node.slug,
              dates: getMostRecentDates(),
              frontmatter: {
                title: node.displayName,
                tags: [],
              },
            }
          }
        })
        .filter((page) => page !== undefined) ?? []
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    // In modalità series usiamo le seriesPages e disabilitiamo il sort
    // (`() => 0` mantiene l'ordine dell'array originale grazie a Array.sort
    // stable in JS moderni). Default: comportamento auto-listing.
    const displayPages = isSeries ? seriesPages : allPagesInFolder
    const listProps = {
      ...props,
      // Series → ordine dichiarato nell'array (sort identity, no riordino).
      // Default → alfabetico per titolo con cartelle in cima (non più per data).
      sort: isSeries ? () => 0 : options.sort ?? alphabeticalFolderFirst,
      allFiles: displayPages,
    }

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    // Mostra il listing automatico solo se questa pagina NON è membro di
    // un'altra series (sennò il listing è ridondante con i bottoni Prev/Next)
    // e NON è essa stessa un hub di series (che ha rendering dedicato).
    const showAutoListing = !isSeries && !isMemberOfSeries

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        {isSeries && (
          <div class="page-listing series-list">
            <p>
              Here you can follow the individual guides in their suggested
              reading order.
            </p>
            <p>
              Start from the first one and continue! You'll find back and forth
              navigation buttons at the end of each page.
            </p>
            <p class="series-toc-heading">Index</p>
            <div>
              <PageList {...listProps} />
            </div>
          </div>
        )}
        {showAutoListing && (
          <div class="page-listing">
            {options.showFolderCount && (
              <p>
                {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                  count: displayPages.length,
                })}
              </p>
            )}
            <div>
              <PageList {...listProps} />
            </div>
          </div>
        )}
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
