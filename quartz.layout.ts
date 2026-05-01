import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import { FileTrieNode } from "./quartz/util/fileTrie"

const explorerSortFn = (a: FileTrieNode, b: FileTrieNode): number => {
  // Ordine dei parent folder a livello root (e in generale di qualsiasi folder
  // che contenga questi slug come figli). Tutto ciò che non è in elenco viene
  // ordinato alfabeticamente dopo.
  const order = [
    "operating-systems",
    "automation",
    "cloud",
    "storage",
    "backup-recovery",
    "observability",
    "networking",
    "hardware",
    "virtualization",
    "security-hardening",
    // Sotto-cartelle (ordinamento applicato anche dentro a folder che contengono questi slug)
    "message-brokers",
    "ceph",
  ]
  const ai = order.indexOf(a.slugSegment.toLowerCase())
  const bi = order.indexOf(b.slugSegment.toLowerCase())
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
    return a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: "base" })
  }
  return a.isFolder ? -1 : 1
}

// Esclude "tags" (default Quartz) e "graph" dall'explorer —
// sono già accessibili via i pulsanti dedicati nella sidebar.
const explorerFilterFn = (node: FileTrieNode): boolean =>
  node.slugSegment !== "tags" &&
  node.slugSegment !== "graph"

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  // Top navbar: full-width fixed, organizzata in tre colonne (brand / search / links)
  header: [
    Component.SiteBrand(),
    Component.Search({ enablePreview: false }),
    Component.Flex({
      components: [
        { Component: Component.GraphToggle() },
        { Component: Component.Darkmode() },
        { Component: Component.FocusMode() },
      ],
    }),
  ],
  // FontResizer floating + SidebarToggle su list pages (folder/tag). Per le
  // content pages le versioni sono in defaultContentPageLayout.afterBody
  // (lo spread sovrascrive interamente l'afterBody condiviso).
  afterBody: [Component.FontResizer(), Component.SidebarToggle()],
  footer: Component.Footer({ links: {}, hidden: true }),
}

const gitHubEdit = Component.GitHubEdit({
  repoUrl: "https://github.com/Artolink/wiki",
  branch: "main",
  contentDir: "content",
})

// Graph "fullscreen" usato sulla pagina /grafico — depth: -1 mostra TUTTI i nodi
// (vs il graph nella sidebar destra che mostra solo i vicini con depth: 1)
const fullPageGraph = Component.Graph({
  localGraph: {
    depth: -1,
    scale: 1.0,
    repelForce: 0.5,
    centerForce: 0.3,
    linkDistance: 35,
    fontSize: 0.65,
    opacityScale: 1,
    showTags: true,
    removeTags: [],
    focusOnHover: true,
    enableRadial: true,
  },
})

export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.Flex({
      components: [
        { Component: Component.ArticleTitle(), grow: true },
        { Component: gitHubEdit },
      ],
    }),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  afterBody: [
    Component.ConditionalRender({
      component: fullPageGraph,
      condition: (page) => page.fileData.slug === "graph",
    }),
    // FontResizer floating: posizionato con position: fixed, appare in basso al
    // centro quando il mouse si avvicina al fondo dello schermo.
    Component.FontResizer(),
    // Pulsante per nascondere/mostrare il menu di sinistra
    Component.SidebarToggle(),
    // Indicatore percentuale di scorrimento del file (solo content pages):
    // barra in basso + pillola con numero. Visibile solo durante lo scroll.
    Component.ScrollProgress(),
  ],
  left: [
    // Toggle in cima alla sidebar (figlio diretto, allineato a destra via CSS).
    // Quando la sidebar viene collassata, sparisce insieme al parent — il
    // suo "gemello" in afterBody prende il suo posto galleggiando a sinistra.
    Component.SidebarToggle(),
    // Mantenuti nella sidebar per stabilità del grid (nascosti su desktop via CSS)
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
        { Component: Component.FocusMode() },
      ],
    }),
    Component.HomeLink(),
    Component.SidebarLink({ label: "Graph view", icon: "🕸️", slug: "graph" }),
    Component.SidebarLink({ label: "Starting Tools", icon: "🛠️", slug: "tags/StartingTools" }),
    Component.Explorer({ title: "Notes", sortFn: explorerSortFn, filterFn: explorerFilterFn }),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Flex({
      components: [
        { Component: Component.ArticleTitle(), grow: true },
        { Component: gitHubEdit },
      ],
    }),
    Component.ContentMeta(),
  ],
  left: [
    Component.SidebarToggle(),
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.HomeLink(),
    Component.SidebarLink({ label: "Graph view", icon: "🕸️", slug: "graph" }),
    Component.SidebarLink({ label: "Starting Tools", icon: "🛠️", slug: "tags/StartingTools" }),
    Component.Explorer({ title: "Notes", sortFn: explorerSortFn, filterFn: explorerFilterFn }),
  ],
  right: [],
}
