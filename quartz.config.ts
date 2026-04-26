import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Dispense",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "it-IT",
    baseUrl: "blog.farnetiandrea.it",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    generateSocialImages: false,
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Inter",
        body: "Inter",
        code: "JetBrains Mono",
      },
      colors: {
        // Light mode — stile syselement/GitBook: fondo bianco pulito,
        // testo quasi-nero, accent arancione per active/hover.
        lightMode: {
          light: "#ffffff",
          lightgray: "#e5e7eb",
          gray: "#9ca3af",
          darkgray: "#4b5563",
          dark: "#111827",
          secondary: "#f97316",
          tertiary: "#fb923c",
          highlight: "rgba(249, 115, 22, 0.12)",
          textHighlight: "#fde04788",
        },
        // Dark mode — palette syselement (GitHub dark inspired): contrasti netti,
        // bordi visibili, testo chiaro, code blocks ben distinti dal body.
        darkMode: {
          light: "#0d1117",      // body bg (GitHub dark)
          lightgray: "#30363d",  // bordi visibili (era #1f2937, troppo invisibile)
          gray: "#8b949e",       // testo muted/uppercase headers (era #6b7280)
          darkgray: "#c9d1d9",   // testo body (era #d1d5db, ora più readable)
          dark: "#f0f6fc",       // headings ben luminosi
          secondary: "#fbbf24",  // accent giallo
          tertiary: "#fcd34d",
          highlight: "rgba(251, 191, 36, 0.18)",
          textHighlight: "#fbbf2433",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "one-light",
          dark: "one-dark-pro",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Plugin.CustomOgImages(),  // disabilitato: rallenta il build, non serve adesso
    ],
  },
}

export default config
