import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import legacyStyle from "./styles/legacyToc.scss"
import modernStyle from "./styles/toc.scss"
import { classNames } from "../util/lang"

// @ts-ignore
import script from "./scripts/toc.inline"
import { i18n } from "../i18n"
import OverflowListFactory from "./OverflowList"
import { concatenateResources } from "../util/resources"

interface Options {
  layout: "modern" | "legacy"
}

const defaultOptions: Options = {
  layout: "modern",
}

let numTocs = 0
export default ((opts?: Partial<Options>) => {
  const layout = opts?.layout ?? defaultOptions.layout
  const { OverflowList, overflowListAfterDOMLoaded } = OverflowListFactory()
  const TableOfContents: QuartzComponent = ({
    fileData,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    if (!fileData.toc) {
      return null
    }

    const id = `toc-${numTocs++}`
    return (
      <div class={classNames(displayClass, "toc")}>
        <button
          type="button"
          class={fileData.collapseToc ? "collapsed toc-header" : "toc-header"}
          aria-controls={id}
          aria-expanded={!fileData.collapseToc}
        >
          <h3>{i18n(cfg.locale).components.tableOfContents.title}</h3>
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
        <OverflowList
          id={id}
          class={fileData.collapseToc ? "collapsed toc-content" : "toc-content"}
        >
          {fileData.toc.map((tocEntry, idx) => {
            // Un item ha figli se l'item successivo è a depth maggiore.
            // Solo gli item con figli mostrano il caret di collapse.
            const nextEntry = fileData.toc![idx + 1]
            const hasChildren = !!nextEntry && nextEntry.depth > tocEntry.depth

            // Conta i figli DIRETTI (depth + 1, fermandosi al primo item
            // di depth pari o minore = fine del sub-tree). Serve per
            // decidere se l'item è collapsed di default.
            let directChildrenCount = 0
            for (let i = idx + 1; i < fileData.toc!.length; i++) {
              const e = fileData.toc![i]
              if (e.depth <= tocEntry.depth) break // uscito dal sub-tree
              if (e.depth === tocEntry.depth + 1) directChildrenCount++
            }

            // Default state:
            //   - più di 2 figli diretti → collapsed (riduci rumore visivo)
            //   - 1 o 2 figli diretti → espanso (sono pochi, mostriamoli)
            //   - nessun figlio → niente data-collapsed (no caret)
            const collapsedByDefault = directChildrenCount > 2
            return (
              <li
                key={tocEntry.slug}
                class={`depth-${tocEntry.depth}`}
                data-depth={tocEntry.depth}
                data-collapsed={
                  hasChildren ? (collapsedByDefault ? "true" : "false") : undefined
                }
              >
                {hasChildren && (
                  <button
                    class="toc-fold"
                    type="button"
                    aria-label="Toggle subsections"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
                <a href={`#${tocEntry.slug}`} data-for={tocEntry.slug}>
                  {tocEntry.text}
                </a>
              </li>
            )
          })}
        </OverflowList>
      </div>
    )
  }

  TableOfContents.css = modernStyle
  TableOfContents.afterDOMLoaded = concatenateResources(script, overflowListAfterDOMLoaded)

  const LegacyTableOfContents: QuartzComponent = ({ fileData, cfg }: QuartzComponentProps) => {
    if (!fileData.toc) {
      return null
    }
    return (
      <details class="toc" open={!fileData.collapseToc}>
        <summary>
          <h3>{i18n(cfg.locale).components.tableOfContents.title}</h3>
        </summary>
        <ul>
          {fileData.toc.map((tocEntry) => (
            <li key={tocEntry.slug} class={`depth-${tocEntry.depth}`}>
              <a href={`#${tocEntry.slug}`} data-for={tocEntry.slug}>
                {tocEntry.text}
              </a>
            </li>
          ))}
        </ul>
      </details>
    )
  }
  LegacyTableOfContents.css = legacyStyle

  return layout === "modern" ? TableOfContents : LegacyTableOfContents
}) satisfies QuartzComponentConstructor
