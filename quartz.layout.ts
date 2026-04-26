import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import { FileTrieNode } from "./quartz/util/fileTrie"

const explorerSortFn = (a: FileTrieNode, b: FileTrieNode): number => {
  const order = ["linux", "kubernetes", "ceph", "openstack"]
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

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  // Top navbar: full-width fixed, organizzata in tre colonne (brand / search / links)
  header: [
    Component.SiteBrand(),
    Component.Search(),
    Component.Flex({
      components: [
        {
          Component: Component.SocialLinks({
            links: [
              { label: "Sito", href: "https://farnetiandrea.it", icon: "home" },
              { label: "GitHub", href: "https://github.com/Artolink", icon: "github" },
              { label: "LinkedIn", href: "https://www.linkedin.com/in/andreafarneti/", icon: "linkedin" },
            ],
          }),
        },
        { Component: Component.Darkmode() },
        { Component: Component.FocusMode() },
      ],
    }),
  ],
  afterBody: [],
  footer: Component.Footer({ links: {}, hidden: true }),
}

const gitHubEdit = Component.GitHubEdit({
  repoUrl: "https://github.com/Artolink/blog",
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
      condition: (page) => page.fileData.slug === "grafico",
    }),
  ],
  left: [
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
    Component.GraphLink(),
    Component.Explorer({ sortFn: explorerSortFn }),
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
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.HomeLink(),
    Component.GraphLink(),
    Component.Explorer({ sortFn: explorerSortFn }),
  ],
  right: [],
}
