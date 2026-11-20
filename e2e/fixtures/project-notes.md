---
title: Project notes
updated: 2026-11-11
---

# Project notes

A short document that uses the common Markdown elements.

## Lists

- Plain item
- Item with `inline code`
  - Nested item

1. First
2. Second

- [x] Done
- [ ] Open

## Table

| Tool    | Purpose | Status |
| ------- | ------- | :----: |
| ripgrep | Search  |   ok   |
| jq      | JSON    |   ok   |

## Code

```ts
export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
```

> A quote can span one or more lines.

Read the [CommonMark spec](https://commonmark.org/) for the details.
