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
    const seriesPages: QuartzPluginData[] = isSeries
      ? seriesSlugs!
          .map((slug) => allFiles.find((f) => f.slug === slug))
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
      sort: isSeries ? () => 0 : options.sort,
      allFiles: displayPages,
    }

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class={isSeries ? "page-listing series-list" : "page-listing"}>
          {isSeries ? (
            <>
              <p>
                Here you can follow the individual guides in their suggested
                reading order.
              </p>
              <p>
                Start from the first one and continue! You'll find back and
                forth navigation buttons at the end of each page.
              </p>
              <p class="series-toc-heading">Index</p>
            </>
          ) : (
            options.showFolderCount && (
              <p>
                {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                  count: displayPages.length,
                })}
              </p>
            )
          )}
          <div>
            <PageList {...listProps} />
          </div>
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
