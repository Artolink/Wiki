---
title: " Take notes like a Pro! - Obsidian guide & setup"
tags:
  - StartingTools
---

## What is Obsidian?

Obsidian is a local-first Markdown note-taking app built around a **personal knowledge base** (vault). Notes are plain `.md` files stored on your machine. 

...What? You don't know how to write Markdown files? 

It's super easy! Make sure to check out my [guide](markdown-guide), it brings Obsidian to the next level.

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

| Concept         | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| **Vault**       | The root folder where all your notes live: just a normal folder on disk              |
| **Note**        | A plain `.md` file                                                                   |
| **Wikilink**    | `[[note-name]]`, links one note to another                                           |
| **Tag**         | `#tag` inline in a note, used for filtering and grouping                             |
| **Graph view**  | Visual map of all notes and their connections                                        |
| **Frontmatter** | YAML metadata block at the top of a note (between `---`)                             |
| **Embed**       | Drop another note's content into the current one: `![[other-note#Specific section]]` |
| **Callout**     | highlighted blocks used to emphasize notes `> [!<CALLOUT_TYPE>]`                     |
### Frontmatter

Metadata block at the very top of the file, between two `---` lines:

```md
---
title: My note
tags:
  - StartingTools
  - Networking
date: 2026-05-05
---
```

Quartz reads it to populate page title, tags, and date. Obsidian uses it to filter and group notes.

### Tags

Inside the body (rendered as clickable):

```md
This note is part of the #StartingTools collection.
```

### Embeds

Drop another note's content into the current one:

```md
![[other-note]]
![[other-note#Specific section]]
```

Useful when a chunk of explanation belongs to several places: write it once, embed it where needed.

### Callouts

```md
> [!<CALLOUT_TYPE>]
> Lorem Impsum
```

#### Modifiers

> [!tip]- Collapsed by default
> Add `-` right after the type: `> [!tip]-` to make it collapsed on page load.

> [!warning]+ Expanded by default (click to collapse)
> Add `+` right after the type: `> [!warning]+` to make it collapsible but open on page load.

> [!info] Custom title
> You can write a custom title right after the type, on the same line: `> [!info] Custom title`.

#### Rich content

> [!example] Callout with everything inside
> Opening paragraph with **bold**, *italic*, `inline code`.
> 
> - Bullet item 1
> - Bullet item 2
> 
> 1. Numbered item 1
> 2. Numbered item 2
> 
> ```bash
> # Code block inside a callout
> echo "horizontal scroll + click-to-copy both work"
> ```
> 
> | Column A | Column B |
> |----------|----------|
> | Row 1    | Value 1  |
> | Row 2    | Value 2  |

And here's every callout type:
***

#### BLUE: generic notes

> [!note]
> Note (default): this is what you get if you write `> [!callout]` without specifying a type, or `> [!note]` explicitly.

***

#### CYAN: info, summaries, todos

> [!abstract]
> Abstract / summary / tldr: for summaries at the top of a page. **Aliases**: `summary`, `tldr`.

> [!summary]
> Summary: alias of abstract.

> [!tldr]
> TL;DR: alias of abstract.

> [!info]
> Info: for neutral information.

> [!todo]
> Todo: for things you still need to do.

***

#### TEAL: tips, hints, important advice

> [!tip]
> Tip: the classic suggestion. **Aliases**: `hint`, `important`.

> [!hint]
> Hint: alias of tip.

> [!important]
> Important: alias of tip.

***

#### GREEN: confirmations, success

> [!success]
> Success: the operation worked. **Aliases**: `check`, `done`.

> [!check]
> Check: alias of success.

> [!done]
> Done: alias of success.

***

#### AMBER: questions, help, FAQ

> [!question]
> Question: for open questions or doubts. **Aliases**: `help`, `faq`.

> [!help]
> Help: alias of question.

> [!faq]
> FAQ: alias of question.

***

#### YELLOW: heads-up, caution

> [!warning]
> Warning: heads-up, something might break. **Aliases**: `attention`, `caution`.

> [!attention]
> Attention: alias of warning (renders identically to a warning, so it is NOT red).

> [!caution]
> Caution: alias of warning.

***

#### PURPLE: examples

> [!example]
> Example: code or configuration snippet.

***

#### RED: danger, errors, failures

> [!danger]
> Danger: critical notice. **Alias**: `error`.

> [!error]
> Error: alias of danger.

> [!failure]
> Failure: something went wrong. **Aliases**: `missing`, `fail`.

> [!missing]
> Missing: alias of failure.

> [!fail]
> Fail: alias of failure.

> [!bug]
> Bug: documenting a known bug.

***

#### GREY: quotes

> [!quote]
> Quote: for quotations. **Alias**: `cite`.

> [!cite]
> Cite: alias of quote.

***

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
  
  Way easier compared to the standard Markdown links that use square and round brackets.
  
  Here's an example using a note with a heading:
```markdown
[[quartz-setup-linux#Installation (Ubuntu/Debian)|Quartz setup on Linux]]
[Quartz setup on Linux](quartz-setup-linux#installation-ubuntudebian)
```

- **Embed a note:** `![[note-name]]` (you just add a "!" before the Wikilink)
  
- **Frontmatter (metadata):**

```markdown
---
tags: [linux, sysadmin]
created: 2026-04-30
---
```

