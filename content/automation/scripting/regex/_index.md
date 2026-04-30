---
title: 🧩 RegEx (regular expressions)
---
## What Are Regex?

Regular expressions (regex) are patterns used to match, search, and manipulate text.
Different tools implement slightly different flavors — knowing which one you're using is essential.

## Flavors & Tools

| Tool | Regex Flavor | Reference |
|------|-------------|-----------|
| `sed` | POSIX | [[regex_sed]] |
| `vim` | POSIX-like (with extensions) | *(page coming soon)* |
| `grep -P` | Perl / PCRE | *(page coming soon)* |
| VSCode | JavaScript (similar to Perl) | [[regex_vscode]] |

> **In practice: learn SED and VSCode — the others follow naturally.**
> - `vim` is similar to `sed` → refer to the SED page
> - `grep -P` supports most POSIX + Perl extensions → refer to the VSCode page for complex patterns

---

## Important: Quoting in the Shell

Always use **single quotes `'`** instead of double quotes `"` around regex patterns.
This prevents the shell from interpreting special characters like `$`.

| Character | How to escape |
| --------- | ------------- |
| `'`       | `\'`          |
| `"`       | `\"`          |
| `\`       | `\\`          |