---
title: " Master Markdown — the only syntax you need to write notes"
tags:
  - Basics
---

## What is Markdown?

The document you are reading right now, is in Markdown.

Every note in this Wiki is written using Markdown... and it's super easy!

Markdown is a tiny set of conventions for writing plain text that **looks structured** when rendered. You don't need a special editor — any `.txt` will do — but tools like [[obsidian-setup|Obsidian]] turn the syntax into a clean visual document as you type.

The whole point: **stop fighting with formatting toolbars**. You write, your hands stay on the keyboard, and the document looks right.

The syntax below covers 95% of what's needed for daily note-taking. Keep this page open while you learn — after a couple of days the muscle memory takes over.

## The essentials

### Headings

```md
# Title (h1)
## Section (h2)
### Subsection (h3)
```

One `#` per level, up to six. Always leave a space between `#` and the text.

### Emphasis

```md
**bold**
*italic*
***bold italic***
~~strikethrough~~
```

### Lists

Unordered:

```md
- first item
- second item
  - nested (two spaces of indent)
- third item
```

Ordered:

```md
1. step one
2. step two
3. step three
```

Numbers don't have to be sequential — Markdown renumbers automatically. Writing `1.` three times in a row works fine.

Task list (very useful in Obsidian):

```md
- [ ] thing to do
- [x] thing already done
```

### Links

External link:

```md
[Anthropic](https://www.anthropic.com)
```

Internal link to another note (Obsidian-flavored, also supported by Quartz):

```md
[[obsidian-setup]]
[[obsidian-setup|with custom label]]
```

The double-bracket form looks the file up by name across the whole vault — no need to write the path.

### Images

```md
![alt text](path/to/image.png)
![[image-in-the-vault.png]]
```

The `![[...]]` form is the Obsidian way: drag-and-drop a file into the note and the link appears automatically.

### Code

Inline:

```md
Run `npm install` to fetch the dependencies.
```

Block: open with three backticks, optionally followed by a language label, write your code, close with three backticks.

~~~md
```bash
sudo systemctl reload nginx
```
~~~

The label after the opening fence (`bash`, `python`, `js`, `yaml`, …) tells the renderer which highlighter to use.

### Quotes

```md
> Anything that can go wrong, will go wrong.
> — Murphy
```

Stack `>` for nested quotes.

### Tables

```md
| Tool      | Purpose             |
| --------- | ------------------- |
| Obsidian  | write & link notes  |
| Quartz    | publish as a site   |
| rsync     | sync to the VPS     |
```

The hyphens under the header decide the column. Add `:` for alignment: `:---` left, `:---:` center, `---:` right.

### Horizontal rule

```md
---
```

Three or more dashes on their own line. Useful as a section separator inside a long note.

## Obsidian extras worth knowing

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

Or in the frontmatter (cleaner — doesn't show up in the rendered text).

### Callouts

```md
> [!note]
> A regular highlighted note.

> [!warning]
> Something to be careful about.

> [!tip]
> A small piece of advice.
```

Common types: `note`, `tip`, `warning`, `info`, `danger`, `quote`, `example`.

### Embeds

Drop another note's content into the current one:

```md
![[other-note]]
![[other-note#Specific section]]
```

Useful when a chunk of explanation belongs to several places — write it once, embed it where needed.

## A few habits that pay off

- **One concept per note.** Markdown rewards short, linkable atoms. A 50-line note with three ideas is harder to reuse than three 15-line notes connected by `[[...]]`.
- **Stay flat.** Deep folder hierarchies become a maintenance burden. Use tags and links, fold the structure into the graph.
- **Don't style what's already styled.** No `<font>`, no `<center>`. The whole point of Markdown is that the renderer decides how things look — focus on the content.
- **Preview while you learn.** In Obsidian, switch between *Source* mode and *Reading* view (`Ctrl+E`) to see how the syntax becomes a finished document. After a week you won't need the preview anymore.
