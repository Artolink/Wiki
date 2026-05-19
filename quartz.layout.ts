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

// Esclude "tags", "graph", "Utilities", "license" e "privacy" dall'explorer —
// alcuni hanno pulsanti dedicati nella sidebar; "license" e "privacy" sono
// linkate dal footer e non devono apparire tra le note.
const explorerFilterFn = (node: FileTrieNode): boolean =>
  node.slugSegment !== "tags" &&
  node.slugSegment !== "graph" &&
  node.slugSegment !== "Utilities" &&
  node.slugSegment !== "license" &&
  node.slugSegment !== "privacy"

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  // Top navbar: full-width fixed.
  // Desktop (>1100px): tre colonne (brand / search / links). I due hamburger
  // sono display:none e ignorati dal grid.
  // Mobile (≤1100px): quattro colonne (hamburger-sx / brand / search /
  // hamburger-dx). Il flex con i 3 pulsanti utility viene nascosto in topbar
  // e mostrato dentro al drawer di destra (vedi quartz/styles/custom.scss e
  // mobileSidebarRightToggle.scss). Aprire un drawer chiude l'altro.
  header: [
    Component.MobileSidebarToggle(),
    Component.SiteBrand(),
    Component.Search({ enablePreview: false }),
    Component.Flex({
      components: [
        // BuyMeCoffee: visibile SOLO nella home (vedi BuyMeCoffee.tsx).
        // Auto-hide via return null sulle altre pagine. Va come primo del
        // Flex (a sinistra di tutti gli altri utility buttons).
        { Component: Component.BuyMeCoffee() },
        // SeriesIndexToggle: bottone "libro" che apre un popup con l'indice
        // della series corrente. Self-hides quando la pagina non è in alcuna
        // series (return null).
        { Component: Component.SeriesIndexToggle() },
        { Component: Component.GraphToggle() },
        { Component: Component.Darkmode() },
        { Component: Component.FocusMode() },
      ],
    }),
    Component.MobileSidebarRightToggle(),
  ],
  // FontResizer floating + SidebarToggle su list pages (folder/tag). Per le
  // content pages le versioni sono in defaultContentPageLayout.afterBody
  // (lo spread sovrascrive interamente l'afterBody condiviso).
  afterBody: [Component.FontResizer(), Component.SidebarToggle()],
  footer: Component.CustomFooter(),
}

const gitHubEdit = Component.GitHubEdit({
  repoUrl: "https://github.com/Artolink/wiki",
  branch: "main",
  contentDir: "content",
})

// Colori custom per singoli tag nel grafo. Chiave = nome esatto del tag come
// nel frontmatter (case-sensitive), valore = qualsiasi colore CSS valido.
// I tag elencati qui hanno il bordo del cerchio del colore indicato (gli altri
// restano col default --tertiary). Inoltre, in hover sul tag, le note collegate
// e i link incidenti vengono tinti dello stesso colore.
const tagColors: Record<string, string> = {
  WebsiteCreation: "#3b82f6", // blu
  StartingTools: "#a16207",   // marrone caldo (ambra scuro)
  Basics: "#ec4899",          // rosa
  Utilities: "#6b7280",       // grigio neutro
  Advanced: "#ef4444",        // rosso (red-500) — distinto dal currentNodeColor (#dc2626, red-600)
  Maintenance: "#ca8a04",     // giallo scuro (yellow-600) — leggibile su bianco, distinto dall'amber di StartingTools
  Projects: "#15803d",        // verde bosco (green-700)
}

// Colore del nodo "tu sei qui" nel grafo: distingue la pagina aperta dagli
// altri nodi. I nodi normali diventano cerchi pieni di questo colore; le tag
// pages hanno bordo di questo colore (mantengono il fill vuoto).
const currentNodeColor = "#dc2626" // rosso

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
    tagColors,
    currentNodeColor,
    showFilters: true,
  },
})

// Graph nella sidebar destra delle pagine: usa i default Quartz (depth:1, ecc.)
// ma con i nostri colori custom per i tag e il nodo corrente.
const sidebarGraph = Component.Graph({
  localGraph: { tagColors, currentNodeColor },
  globalGraph: { tagColors, currentNodeColor },
})

// Pulsanti utility (graph-toggle / darkmode / focus-mode) replicati come
// primo elemento della sidebar.right. Su desktop ≥1500px sono nascosti via
// CSS (sono già nella topbar); sotto i 1100px la topbar li nasconde e questi
// diventano l'unica copia, accessibile dal drawer destro.
// Vedi mobileSidebarRightToggle.scss per le regole di display.
const sidebarRightActions = Component.Flex({
  components: [
    // Stesso ordine della topbar: BuyMeCoffee come primo (solo home), poi
    // il toggle indice (solo pagine in series), poi gli altri utility.
    { Component: Component.BuyMeCoffee() },
    { Component: Component.SeriesIndexToggle() },
    { Component: Component.GraphToggle() },
    { Component: Component.Darkmode() },
    { Component: Component.FocusMode() },
  ],
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
    // Bottoni Previous / Next per serie di pagine. Opt-in: si attiva solo
    // se la pagina è elencata nel frontmatter `series:` di un'altra pagina
    // ("hub"). Vedi quartz/components/PageSequenceNav.tsx per i dettagli.
    Component.PageSequenceNav(),
    // FontResizer floating: posizionato con position: fixed, appare in basso al
    // centro quando il mouse si avvicina al fondo dello schermo.
    Component.FontResizer(),
    // Page progress: pillola floating in basso, sopra al FontResizer. Mostra
    // quante checkbox sono spuntate sulla pagina. Auto-hidden se la pagina
    // non contiene checkbox. Toast verde + tick al 100%.
    Component.PageProgress(),
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
    Component.SidebarLink({ label: "Basic Knowledge", icon: "🧠", slug: "tags/Basics" }),
    Component.SidebarLink({ label: "Projects", icon: "🚀", slug: "tags/Projects" }),
    Component.SidebarLink({ label: "Utilities", icon: "🧰", slug: "tags/Utilities" }),
    Component.Explorer({ title: "Notes", sortFn: explorerSortFn, filterFn: explorerFilterFn }),
  ],
  right: [
    sidebarRightActions,
    sidebarGraph,
    Component.DesktopOnly(Component.TableOfContents()),
    // SeriesIndex statico — appare SOLO sotto i 1100px (vedi media query in
    // styles/seriesIndex.scss), cioè dentro al drawer destro mobile. Su
    // desktop l'indice è accessibile via il bottone "libro" in topbar
    // (Component.SeriesIndexToggle, nascosto in mobile dal proprio CSS).
    // Restituisce null se la pagina non appartiene a una series.
    Component.SeriesIndex(),
    // Backlinks disabilitati a livello di layout — il componente esiste ancora
    // in quartz/components/Backlinks.tsx, basta rimettere `Component.Backlinks()`
    // qui sotto per riattivarli.
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
  // PageSequenceNav prima dei due "shared" (FontResizer + SidebarToggle)
  // così le _index pages che fanno parte di una series mostrano i bottoni
  // Prev/Next a fondo pagina come le content page normali. Le _index pages
  // senza `series:` (o non elencate nella series di un'altra pagina) vedono
  // PageSequenceNav che ritorna null e quindi non renderizza nulla.
  //
  // Le altre due voci sono replicate dallo sharedPageComponents.afterBody
  // perché lo spread `...pageLayout` in renderPage.tsx sovrascrive interamente
  // l'afterBody condiviso quando il PageLayout ne dichiara uno proprio.
  afterBody: [
    Component.PageSequenceNav(),
    Component.FontResizer(),
    Component.SidebarToggle(),
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
    Component.SidebarLink({ label: "Basic Knowledge", icon: "🧠", slug: "tags/Basics" }),
    Component.SidebarLink({ label: "Projects", icon: "🚀", slug: "tags/Projects" }),
    Component.SidebarLink({ label: "Utilities", icon: "🧰", slug: "tags/Utilities" }),
    Component.Explorer({ title: "Notes", sortFn: explorerSortFn, filterFn: explorerFilterFn }),
  ],
  // Pulsanti utility nel drawer destro (no Graph/TOC/Backlinks per le list
  // pages). Nascosti su desktop, visibili solo nel drawer mobile.
  // SeriesIndex statico per le _index pages member di una series: appare
  // solo sotto i 1100px (drawer mobile). Su desktop l'indice è nel popup
  // del bottone "libro" in topbar.
  right: [sidebarRightActions, Component.SeriesIndex()],
}
