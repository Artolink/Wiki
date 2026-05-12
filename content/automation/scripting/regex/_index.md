---
title: 🧩 RegEx (regular expressions)
tags:
  - Basics
---
## What Are Regex?

Regular expressions (regex) are patterns used to match, search, and manipulate text.

They are extremely helpful to edit multiple lines of text at the same time, by selecting only specific occurrences that match the criteria defined by the regular expression itself.

Different tools implement slightly different flavors, so knowing which one you're using is essential.

## Flavors & Tools

| Tool      | Regex Flavor                 | Reference                    |
| --------- | ---------------------------- | ---------------------------- |
| `sed`     | POSIX                        | [sed Regex](regex-sed)       |
| `vim`     | POSIX-like (with extensions) | [vim Regex](regex-vim.md)    |
| `grep -P` | Perl / PCRE                  | [grep Regex](regex-grep)     |
| VSCode    | JavaScript (similar to Perl) | [VSCode Regex](regex-vscode) |

**In practice: learn SED and VSCode, and the others will follow naturally**:

 - `vim` is similar to `sed`, so refer to the SED page
 - `grep -P` supports most POSIX + Perl extensions, so refer to the VSCode page for complex patterns

---

## Important: Quoting in the Shell

Always use **single quotes `'`** instead of double quotes `"` around regex patterns.
This prevents the shell from interpreting special characters like `$`.

| Character | How to escape |
| --------- | ------------- |
| `'`       | `\'`          |
| `"`       | `\"`          |
| `\`       | `\\`          |