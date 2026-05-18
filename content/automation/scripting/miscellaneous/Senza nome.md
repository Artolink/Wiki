---
title: "Callouts: all types and aliases"
tags:
---
This is the callout test page. Each color group bundles the aliases that render identically.

***

## 🔵 BLUE: info, knowledge, suggestions

> [!note]
> Note (default): this is what you get if you write `> [!callout]` without specifying a type, or `> [!note]` explicitly.

> [!tip]
> Tip: the classic suggestion. **Aliases**: `hint`, `important`.

> [!hint]
> Hint: alias of tip.

> [!important]
> Important: alias of tip.

> [!info]
> Info: for neutral information.

> [!question]
> Question: for open questions or doubts. **Aliases**: `help`, `faq`.

> [!help]
> Help: alias of question.

> [!faq]
> FAQ: alias of question.

> [!todo]
> Todo: for things you still need to do.

> [!abstract]
> Abstract / summary / tldr: for summaries at the top of a page. **Aliases**: `summary`, `tldr`.

> [!summary]
> Summary: alias of abstract.

> [!tldr]
> TL;DR: alias of abstract.

***

## 🟢 GREEN: examples, confirmations, success

> [!success]
> Success: the operation worked. **Aliases**: `check`, `done`.

> [!check]
> Check: alias of success.

> [!done]
> Done: alias of success.

> [!example]
> Example: code or configuration snippet.

***

## 🟡 YELLOW: heads-up, caution

> [!warning]
> Warning: heads-up, something might break. **Aliases**: `attention`, `caution`.

> [!attention]
> Attention: alias of warning (renders identically to a warning — it is NOT red). For red, use `danger`, `error` or `failure`.

> [!caution]
> Caution: alias of warning.

***

## 🔴 RED: danger, errors, failures

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

## 🩷 PINK: quotes

> [!quote]
> Quote: for quotations. **Alias**: `cite`.

> [!cite]
> Cite: alias of quote.

***

## Modifiers

> [!tip]- Collapsed by default
> Add `-` right after the type: `> [!tip]-` to make it collapsed on page load.

> [!warning]+ Expanded by default (click to collapse)
> Add `+` right after the type: `> [!warning]+` to make it collapsible but open on page load.

> [!info] Custom title
> You can write a custom title right after the type, on the same line: `> [!info] Custom title`.

***

## Rich content

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