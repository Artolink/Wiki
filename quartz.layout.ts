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
  header: [],
  afterBody: [],
  footer: Component.Footer({ links: {}, hidden: true }),
}

export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
        { Component: Component.FocusMode() },
      ],
    }),
    Component.Explorer({ sortFn: explorerSortFn }),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({ sortFn: explorerSortFn }),
  ],
  right: [],
}
