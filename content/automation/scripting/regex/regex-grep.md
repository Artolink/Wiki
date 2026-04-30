---
title: Regex for Grep (Perl with Posix support)
---

> `grep` regex is Perl-compatible (PCRE): refer to [the VSCode regex](regex-vscode) for the core syntax.
> Always use the `-P` flag to enable PCRE mode. Without it, `grep` falls back to BRE (like SED).

---

## Flags Cheatsheet

| Flag | Description |
|------|-------------|
| `-P` | Enable PCRE mode — use this always for VSCode-like syntax |
| `-E` | Enable ERE mode (no PCRE, simpler alternative to `-P`) |
| `-i` | Case-insensitive match |
| `-n` | Show line numbers alongside matches |
| `-r` | Recurse into subdirectories |
| `-l` | Print only filenames containing a match (not the lines) |
| `-v` | Invert match — print lines that do **not** match |
| `-o` | Print only the matched portion, not the whole line |
| `-c` | Count matching lines |

---

## How to Use Grep

| Command | Description |
|---------|-------------|
| `grep -P 'pattern' file.txt` | Match pattern in a file |
| `grep -rP 'pattern' ./dir` | Recursive search in a directory |
| `grep -rPl 'pattern' ./dir` | List only files with a match |
| `grep -Pn 'pattern' file.txt` | Show matches with line numbers |
| `grep -Pv 'pattern' file.txt` | Show lines that do NOT match |
| `grep -Po 'pattern' file.txt` | Extract only the matched text |

---

## Grep-Specific Notes

- **No `\<` / `\>`** boundary syntax from SED — use `\b` as in VSCode
- **Lookaheads and lookbehinds** are supported with `-P`:

```bash
grep -P 'foo(?=bar)' file.txt     # "foo" only if followed by "bar"
grep -P 'foo(?!bar)' file.txt     # "foo" only if NOT followed by "bar"
grep -P '(?<=@)\w+' file.txt      # word after "@" (e.g. domain in an email)
```

---

## Exercises

### Find lines containing an IPv4 address

```bash
grep -P '\b\d{1,3}(\.\d{1,3}){3}\b' file.txt
```

### Extract all email addresses from a file

```bash
grep -Po '[\w.+-]+@[\w-]+\.[a-z]{2,}' file.txt
```

### Find lines that do NOT contain a number

```bash
grep -Pv '\d' file.txt
```