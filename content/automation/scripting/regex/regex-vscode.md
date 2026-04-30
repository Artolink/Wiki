---
title: Regex in VSCode (JavaScript / Perl-like)
---
# Regex — VSCode (JavaScript / Perl-like)

> **Also valid for:** `grep -P` (add `-P` flag for PCRE mode — covers almost everything below)

> **Tip:** Once you have matched what you want with a regex, to select **all occurrences** found: `ALT + ENTER`

---

## Shorthand Character Classes

| Pattern | Matches |
|---------|---------|
| `\d` | Any digit (`0–9`) |
| `\w` | Any word character (letters and digits) |
| `\s` | Any whitespace (including `\n` and `\t`) |
| `\n` | Newline |
| `\t` | Tab |

> **Uppercase = opposite**: `\D` matches anything that is NOT a digit, `\W` not a word character, `\S` not whitespace.

---

## Anchors

| Pattern | Meaning |
|---------|---------|
| `^` | Start of line *(outside a character class)* |
| `$` | End of line |
| `[^...]` | **Negation** inside a class — excludes everything listed. Example: `[^0-4]` excludes digits 0–4 |

---

## Wildcards & Quantifiers

| Pattern | Meaning |
|---------|---------|
| `.` | Any single character |
| `?` | 0 or 1 of the preceding element — makes it optional. Example: `.docx?` matches `.doc` and `.docx` |
| `+` | 1 or more of the preceding element. Example: `[0-9]+` matches `8` or `3451234567` |
| `*` | 0 or more of the preceding element. Example: `10*` matches `1`, `10`, `100`, `1000`… |
| `{n,m}` | Between `n` and `m` occurrences. Example: `\w{2,3}` matches `ww`, `www`, `123`… |

**Quantifier equivalences:**

```text
? = {0,1}
+ = {1,}
* = {0,}
```

> **Lazy qualifiers:** out of scope for now.

---

## Boundaries

`\b` specifies a word boundary — useful to match exact words:

| Pattern | Matches |
|---------|---------|
| `\bcalm` | Words that **start** with `calm` |
| `calm\b` | Words that **end** with `calm` |
| `\bcalm\b` | Exactly the word `calm` and nothing else |

---

## Groups & Alternation

Groups are defined with parentheses `()`. Operators and quantifiers can be applied to the whole group.
Alternation uses `|` (OR) inside a group.

**Example 1 — generic:**

```text
(\w+)([ -])?(Man)
```

Matches: `Spider-Man`, `Super Man`, `Batman`

**Example 1 — more specific:**

```text
(spider|super|bat)[- ]?[Mm]an
```

**Example 2:**

```text
(High|Mid|Low)-level
```

Matches: `High-level`, `Mid-level`, `Low-level`

---

## Exercises

### Match phone number format `123-45-6789`

```text
[0-9]{3}-[0-9]{2}-[0-9]{4}
```

### Match an IPv4 address

```text
\b\d{1,3}(\.\d{1,3}){3}\b
```

> **Note:** This does not validate whether octets exceed 255 — handling that would make the regex significantly more complex.