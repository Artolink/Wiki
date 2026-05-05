---
title: Regex for sed (Posix)
---
> [!NOTE]
> **This is also valid for** [vim](regex-vim.md) (POSIX-like with minor extensions — behavior is nearly identical)

> [!INFO]
> **sed has two modes:**
> - **BRE** (Basic Regular Expressions) — default, `sed 'pattern'`
> - **ERE** (Extended Regular Expressions) — activated with `-E` flag, `sed -E 'pattern'`
>
> The main difference is how special characters are escaped (see each section below).

---

## Shorthand Character Classes

Unlike VSCode/Perl, POSIX does **not** support `\d`, `\w`, `\s`.
Use POSIX named classes inside `[[:class:]]` instead:

| POSIX Class | Matches | VSCode equivalent |
|-------------|---------|-------------------|
| `[[:digit:]]` | Any digit (`0-9`) | `\d` |
| `[[:alpha:]]` | Any letter (`a-z`, `A-Z`) | — |
| `[[:alnum:]]` | Letters and digits | `\w` (approx.) |
| `[[:space:]]` | Any whitespace | `\s` |
| `[[:upper:]]` | Uppercase letters | — |
| `[[:lower:]]` | Lowercase letters | — |
| `[[:punct:]]` | Punctuation characters | — |

**Example:**

```bash
sed 's/[[:digit:]]//g' file.txt   # remove all digits
```

---

## Anchors

| Pattern | Meaning |
|---------|---------|
| `^` | Start of line |
| `$` | End of line |
| `[^...]` | **Negation** inside a class. Example: `[^0-4]` excludes digits 0-4 |

**Example:**

```bash
sed 's/^/>>> /' file.txt    # prepend >>> to every line
sed 's/$/;/' file.txt       # append ; to every line
```

---

## Wildcards & Quantifiers

| Meaning | BRE | ERE (`-E`) |
|---------|-----|------------|
| Any single character | `.` | `.` |
| 0 or 1 (optional) | `\?` | `?` |
| 1 or more | `\+` | `+` |
| 0 or more | `*` | `*` |
| Between n and m | `\{n,m\}` | `{n,m}` |

> **Key rule:** in BRE, quantifiers need a backslash: `\+`, `\?`, `\{n,m\}`. In ERE (`-E`), they work without: `+`, `?`, `{n,m}`.

**Example:**

```bash
sed -E 's/[0-9]+/NUM/g' file.txt    # ERE syntax
sed 's/[0-9]\+/NUM/g' file.txt      # BRE syntax (same result)
```

---

## Boundaries

POSIX does not support `\b`. Use `\<` and `\>` instead:

| Pattern | Matches |
|---------|---------|
| `\<calm` | Words that **start** with `calm` |
| `calm\>` | Words that **end** with `calm` |
| `\<calm\>` | Exactly the word `calm` and nothing else |

**Example:**

```bash
sed 's/\<calm\>/PEACE/g' file.txt
```

---

## Groups & Backreferences

Groups are defined with `\(...\)` in BRE and `(...)` in ERE.
Captured groups can be referenced with `\1`, `\2`, etc.

**Example — swap two words:**

```bash
sed -E 's/(hello) (world)/\2 \1/' file.txt
# Output: "world hello"
```

**Example — alternation (ERE only):**

```bash
sed -E 's/(High|Mid|Low)-level/LEVEL/g' file.txt
```

> **Note:** Alternation with `|` requires `-E` in SED. In BRE it is not supported natively.

---

## SED Command Structure

```bash
sed [options] 's/PATTERN/REPLACEMENT/FLAGS' file.txt
```

| Component | Description |
|-----------|-------------|
| `s` | Substitution command (most common) |
| `g` | Replace **all** occurrences per line (not just the first) |
| `i` | Case-insensitive match |
| `-E` | Enable ERE syntax |
| `-i` | Edit file **in place** (overwrites the original) |

**Example:**

```bash
sed -E -i 's/foo/bar/g' file.txt    # replace all "foo" with "bar" in-place
```

---

## Exercises

### Remove blank lines from a file

```bash
sed '/^$/d' file.txt
```

### Match a phone number

```bash
sed -E 's/[0-9]{3}-[0-9]{2}-[0-9]{4}/PHONE/g' file.txt
```

### Match an IPv4 address

```bash
sed -E 's/(([0-9]{1,3}\.){3}[0-9]{1,3})/IP/g' file.txt
```

> **Note:** Use `\<` / `\>` instead of `\b` for strict POSIX compliance.