import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Andrea Farneti - Wiki",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "en-US",
    baseUrl: "wiki.farnetiandrea.it",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    generateSocialImages: false,
    theme: {
      fontOrigin: "googleFonts",
      // false = al build Quartz scarica i CSS e i file font da Google e li serve
      // dal proprio dominio. Niente call runtime a fonts.googleapis.com /
      // fonts.gstatic.com → niente trasferimento IP utente a Google (GDPR-clean).
      cdnCaching: false,
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
        // Dark mode — palette syselement: warm stone (toni marroncini),
        // ispirata a gruvbox/syselement. Sfumatura calda invece del blue-slate.
        darkMode: {
          light: "#1c1917",      // stone-900 (warm dark, marroncino)
          lightgray: "#44403c",  // stone-700 (bordi visibili e caldi)
          gray: "#a8a29e",       // stone-400 (muted/uppercase headers)
          darkgray: "#e7e5e4",   // stone-200 (testo body, ottimo contrasto)
          dark: "#fafaf9",       // stone-50 (headings molto luminosi)
          secondary: "#fbbf24",  // accent giallo (amber)
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
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false, enableCheckbox: true }),
      Plugin.GitHubFlavoredMarkdown(),
      // maxDepth default è 3 → gli `####` (h4) verrebbero esclusi dalla TOC.
      // Alziamo a 4 così le sottosezioni `####` compaiono nel menu a destra.
      Plugin.TableOfContents({ maxDepth: 4 }),
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
