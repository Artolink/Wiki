
## What is Quartz?

Quartz is a fast, batteries-included **static site generator** that turns a folder of Markdown files (typically an [[The ultimate Obsidian setup! - Installation & Configuration|Obsidian]] vault) into a fully-functional website.

The site is built once with `npx quartz build`, the output is plain HTML/CSS/JS in `public/`, and you can serve it from any web server (Nginx, Caddy, GitHub Pages, Netlify, …).

***

## Prerequisites

| Requirement | Why |
|---|---|
| **Node.js 22+** | Quartz uses modern ES modules and APIs |
| **npm 10.9+** | Bundled with Node 22 |
| **Git** | Quartz versions content + you typically push to GitHub |
| **An Obsidian vault** | The Markdown source for the site |

***

## Installation (Ubuntu/Debian)

### 1. Install Node.js 22 via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
node -v   # -> v22.x
```

### 2. Clone Quartz

```bash
cd ~
git clone https://github.com/jackyzha0/quartz.git wiki
cd wiki
npm install
```

If you already have your own fork (recommended for customization), use that URL instead.

### 3. First build

```bash
npx quartz build
```

The output ends up in `public/`. For a local preview:

```bash
npx quartz build --serve
# -> http://localhost:8080
```

***

## Project structure

| Path | Purpose |
|---|---|
| `content/` | Your Markdown notes — the *content* of the site |
| `quartz/` | Generator source code (do not touch unless customizing) |
| `quartz.config.ts` | Site config: title, colors, fonts, locale, plugins |
| `quartz.layout.ts` | Layout: header, sidebar, footer, explorer order |
| `deploy.sh` | Custom build + deploy script (yours to write) |
| `public/` | Generated output (gitignored) |

Anything outside `content/`, `quartz.config.ts`, `quartz.layout.ts` is Quartz infrastructure — **don't touch it** unless you know what you're doing.

***

## Customization basics

### Site identity — `quartz.config.ts`

```ts
configuration: {
  pageTitle: "My Wiki",
  baseUrl: "wiki.example.com",
  locale: "en-US",
  theme: {
    colors: { lightMode: { ... }, darkMode: { ... } },
    typography: { header: "Inter", body: "Inter", code: "JetBrains Mono" },
  },
}
```

### Layout — `quartz.layout.ts`

Header, sidebars and footer are composed by listing components:

```ts
left: [
  Component.HomeLink(),
  Component.SidebarLink({ label: "Graph view", icon: "🕸️", slug: "graph" }),
  Component.Explorer({ ... }),
]
```

***

## Linking from Obsidian

If your `content/` folder *is* (or mirrors) your Obsidian vault, all your wikilinks `[[note-name]]` already work in Quartz — handled by the `ObsidianFlavoredMarkdown` plugin. Same for callouts (`> [!NOTE]`), embeds (`![[note]]`), tags.

Write notes locally in Obsidian, publish them as-is. No syntax conversion required.

***

## Deploy

Smallest possible deploy script (Linux + Nginx):

```bash
#!/bin/bash
set -euo pipefail
cd ~/wiki
npx quartz build
chmod -R o+rX public/
```

Then point Nginx `root` at `~/wiki/public/` and reload.

For the full pipeline (Obsidian vault on PC → rsync → VPS → Quartz build → Nginx + GitHub backup), see [[Create a Wiki like this!]].