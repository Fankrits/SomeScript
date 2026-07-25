# SomeScript Docs

This Docus/Nuxt site publishes the SomeScript documentation. Its content lives in `content/`, ordered by the sidebar section and page prefix.

## Development

Use the repository's Bun version and run commands from this directory:

```bash
bun install
bun run dev
```

The development server runs at `http://localhost:3003`. Build the production site with `bun run build`; the generated deployment output is written to `.output/`.

## KaTeX previews

Inline and display mathematics in prose is rendered automatically with `$...$` and `$$...$$`.

Formula-only `latex` and `tex` fences automatically get a **Show Preview** button when KaTeX can render them:

````md
```latex
\begin{equation}
  E = mc^2
\end{equation}
```
````

Complete documents, package configuration, references, drawings, tables, and unsupported LaTeX examples remain source code only.
