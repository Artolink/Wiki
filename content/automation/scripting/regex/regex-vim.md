---
title: Regex for Vim (Posix-like)
---
> [!NOTE]
> VIM regex is based on POSIX: check out the [Regex for SED](regex-sed) for the core syntax.

---

## VIM-Specific Extensions

VIM introduces a few additions on top of standard POSIX:

| Pattern | Meaning |
|---------|---------|
| `\d` | Any digit — shorthand for `[[:digit:]]` |
| `\w` | Any word character — shorthand for `[[:alnum:]_]` |
| `\s` | Any whitespace — shorthand for `[[:space:]]` |
| `\u` | Uppercase letter — shorthand for `[[:upper:]]` |
| `\l` | Lowercase letter — shorthand for `[[:lower:]]` |

> **Uppercase = opposite**, same rule as VSCode: `\D`, `\W`, `\S` match the negation.

---

## Magic Modes

VIM controls how special characters are interpreted via **magic modes**, set at the start of a pattern:

| Prefix | Mode | Behaviour |
|--------|------|-----------|
| `\m` | magic (default) | `.`, `*` are special; `+`, `?`, `{` need `\` |
| `\M` | nomagic | Only `^` and `$` are special |
| `\v` | very magic | All special chars work without `\` — closest to ERE/VSCode |
| `\V` | very nomagic | Everything is literal except `\` |

> **Tip:** Use `\v` at the start of your pattern to write regex in a VSCode/Perl-like style without escaping everything.

**Example:**

```vim
:%s/\v(High|Mid|Low)-level/LEVEL/g
```

---

## How to Use Regex in VIM

| Command | Description |
|---------|-------------|
| `/pattern` | Search forward |
| `?pattern` | Search backward |
| `:%s/pattern/replacement/g` | Replace all occurrences in the file |
| `:s/pattern/replacement/g` | Replace on current line only |
| `n` / `N` | Jump to next / previous match |