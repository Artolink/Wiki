---
title: " Master Markdown: the only syntax you need to write notes"
tags:
  - Basics
---

## What is Markdown?

The document you are reading right now, is Markdown.

Every note in this Wiki is written using Markdown... and it's super easy!

Markdown is a tiny set of conventions for writing plain text that **looks structured** when rendered. You don't need a special editor, any `.txt` will do, but tools like [[obsidian-setup|Obsidian]] turn the syntax into a clean visual document as you type.

The whole point: **stop fighting with formatting toolbars**. You write, your hands stay on the keyboard, and the document looks right.

The syntax below covers 95% of what's needed for daily note-taking. 

Keep this page open while you learn: after a couple of days the muscle memory takes over.

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

Numbers don't have to be sequential: Markdown renumbers automatically. 

Writing `1.` three times in a row works fine.

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

The double-bracket form looks the file up by name across the whole vault, no need to write the path.

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
--- (or ***)
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