---
title: " Take notes like a Pro! - Obsidian guide & setup"
tags:
  - StartingTools
---

## What is Obsidian?

Obsidian is a local-first Markdown note-taking app built around a **personal knowledge base** (vault).
Notes are plain `.md` files stored on your machine — no lock-in, no cloud required.
The real power is in **linking notes together** and visualising connections through the graph view.

***

## Installation

### Windows
1. Go to [https://obsidian.md/download](https://obsidian.md/download) and click **Universal**
2. Run the `.exe` installer and follow the wizard
3. Launch Obsidian from the Start Menu

### Linux (Debian/Ubuntu)

```bash
wget https://github.com/obsidianmd/obsidian-releases/releases/latest/download/obsidian_amd64.deb
sudo apt install ./obsidian_amd64.deb
```

***

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Vault** | The root folder where all your notes live — just a normal folder on disk |
| **Note** | A plain `.md` file |
| **Wikilink** | `[[note-name]]` — links one note to another |
| **Tag** | `#tag` inline in a note — used for filtering and grouping |
| **Graph view** | Visual map of all notes and their connections |
| **Canvas** | Free-form board to arrange and connect notes visually |
| **Frontmatter** | YAML metadata block at the top of a note (between `---`) |

***

## Essential Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + P` | Open **Command Palette** — the most important shortcut |
| `Ctrl + O` | Quick switcher — open any note by name |
| `Ctrl + E` | Toggle edit / reading view |
| `Ctrl + N` | Create a new note |
| `Ctrl + ,` | Open Settings |
| `Ctrl + G` | Open graph view |
| `Ctrl + click` | Follow a wikilink |
| `Ctrl + W` | Close current tab |
| `Ctrl + Shift + F` | Search across the entire vault |
| `Alt + Enter` | Follow link under cursor / open in new pane |

***

## Markdown Tips for Obsidian

- **Wikilinks:** `[[note-name]]` or `[[note-name|display text]]`
- **Embed a note:** `![[note-name]]`
- **Embed a specific heading:** `![[note-name#Heading]]`
- **Callout blocks:**

```markdown
> [!NOTE]
> This is a note callout.

> [!WARNING]
> This is a warning callout.

> [!TIP]
> Available types: NOTE, TIP, WARNING, DANGER, INFO, SUCCESS, QUESTION
```

- **Frontmatter (metadata):**

```markdown
---
tags: [linux, sysadmin]
created: 2026-04-30
---
```

***

## Recommended Core Plugins to Enable

*(Settings → Core plugins)*

| Plugin             | Why enable it                               |
| ------------------ | ------------------------------------------- |
| **Backlinks**      | See which notes link to the current one     |
| **Outgoing links** | See all links from the current note         |
| **Templates**      | Insert reusable note templates              |
| **Daily notes**    | Auto-create a note for each day             |
| **Quick switcher** | Fast navigation between notes               |
| **File recovery**  | Snapshots of your notes — useful safety net |
| **Canvas**         | Visual board to connect notes freely        |

***

## Sync Options (Free)

| Method                          | Notes                                              |
| ------------------------------- | -------------------------------------------------- |
| **Git + GitHub**                | Best for technical users: version control included |
| **iCloud / OneDrive / Dropbox** | Works by pointing the vault to a synced folder     |
| **Syncthing**                   | Peer-to-peer, no cloud, works great on Linux       |