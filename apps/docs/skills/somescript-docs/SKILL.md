---
name: somescript-docs
description: Practical guidance and conventions for writing, typesetting, and publishing documentation in SomeScript Docs. Use when writing or editing LaTeX guides, KaTeX previews, or Docus components.
---

# SomeScript Documentation Skill

This skill provides guidelines and patterns for writing documentation in SomeScript Docs.

## Overview

SomeScript Docs is powered by **Docus** (Nuxt 4 + Nuxt Content). It supports standard Markdown, GFM tables, KaTeX inline/display math, and MDC components.

## Math & KaTeX Formatting

- **Inline Math**: Use single dollar signs `$E = mc^2$` or standard delimiters.
- **Display Math**: Use double dollar signs `$$...$$` or standard LaTeX equation blocks.
- **Formula-only Code Fences**: Code blocks marked with ````latex` or ````tex` will automatically present a **Show Preview** button powered by KaTeX.

```latex
\begin{equation}
  f(x) = \int_{-\infty}^{\infty} \hat{f}(\xi)\,e^{2\pi i \xi x}\,d\xi
\end{equation}
```

## Structure & File Naming

- Store documentation files under `content/`.
- Use numbered folder and file prefixes (e.g., `01.getting-started/01.introduction.md`) to order sidebar navigation.
