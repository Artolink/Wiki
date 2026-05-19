---
title: " Master Markdown: the only syntax you need to write notes"
tags:
  - Basics
---

## What is Markdown?

The document you are reading right now, is Markdown.

Every note in this Wiki is written using Markdown... and it's super easy!

Markdown is a tiny set of conventions for writing plain text that **looks structured** when rendered. 

You don't need a special editor, any `.txt` will do, but tools like [[obsidian-setup|Obsidian]] turn the syntax into a clean visual document as you type.

The whole point: **stop fighting with formatting toolbars**. You write, your hands stay on the keyboard, and the document looks right.

The syntax below covers 95% of what's needed for daily note-taking, but for professional use, I suggest checking out also the few [[obsidian-setup|Obsidian]] additions. 

Keep this page open while you learn: after a couple of days the muscle memory takes over.

***
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
