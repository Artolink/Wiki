---
title: Quartz setup - Transform your notes in a site!
tags:
  - WebsiteCreation
---

## What is Quartz?

Quartz is a fast **static site generator** that turns a folder of [Markdown](markdown-guide) files (typically an [[obsidian-setup|Obsidian]] vault) into a fully-functional website.

The site is built once with `npx quartz build`, the output is plain HTML/CSS/JS in the `public/` folder, and you can serve it from any web server ([Nginx](nginx-web-server-setup.md), Apache, GitHub Pages…).

***

## Prerequisites

| Requirement             | Why                                    |
| ----------------------- | -------------------------------------- |
| **Node.js 22+**         | Quartz uses modern ES modules and APIs |
| **npm 10.9+**           | Bundled with Node 22                   |
| **Git** (not mandatory) | you typically want to push to GitHub   |
| **An Obsidian vault**   | The Markdown source for the site       |

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

Clone Quartz in any folder that you want to use as the "container" for your site.

In my case, I host this Wiki in the folder "wiki" of my VPS, so:
```bash
cd ~
git clone https://github.com/jackyzha0/quartz.git wiki
cd wiki
npm install
```

### 3. First build

```bash
npx quartz build
```

The output ends up in `public/`. 

The content of the site (so our Markdown notes) has to go in `content/`.

For a local preview, you can use:

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

### Site identity: `quartz.config.ts`

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

### Layout: `quartz.layout.ts`

Header, sidebars and footer are composed by listing components:

```ts
left: [
  Component.HomeLink(),
  Component.SidebarLink({ label: "Graph view", icon: "🕸️", slug: "graph" }),
  Component.Explorer({ ... }),
]
```

