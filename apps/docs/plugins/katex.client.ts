import { defineNuxtPlugin } from '#app'
import { renderToString } from 'katex'

/** Patterns that indicate a code block is NOT a pure math formula */
const SKIP_PATTERNS = [
  // Document structure
  '\\documentclass',
  '\\usepackage',
  '\\begin{document}',
  '\\end{document}',
  '\\title{',
  '\\author{',
  '\\maketitle',
  '\\tableofcontents',
  // Commands/macros
  '\\newcommand',
  '\\renewcommand',
  '\\def\\',
  '\\DeclareMathOperator',
  // TikZ / PGF
  '\\begin{tikzpicture}',
  '\\usetikzlibrary',
  '\\tikzset',
  '\\tikzstyle',
  '\\draw ',
  '\\path[',
  '\\node[',
  '\\fill ',
  '\\filldraw',
  '\\clip ',
  '\\begin{scope}',
  '\\end{scope}',
  // PSTricks
  '\\begin{pspicture}',
  '\\psset',
  '\\rput',
  '\\psline',
  '\\psframe',
  // Algorithms
  '\\begin{algorithm}',
  '\\begin{algorithmic}',
  '\\State ',
  '\\If{',
  '\\Else',
  '\\For{',
  '\\While{',
  '\\Return ',
  // Code listings
  '\\begin{lstlisting}',
  '\\begin{verbatim}',
  '\\begin{minted}',
  // Graphics / figures
  '\\includegraphics',
  '\\input{',
  '\\graphicspath',
  // Layout
  '\\pagestyle',
  '\\thispagestyle',
  '\\setlength',
  '\\setcounter',
  '\\numberwithin',
  '\\linespread',
  '\\baselinestretch',
  // Cross-references (KaTeX can render but output is wrong)
  '\\ref{',
  '\\eqref{',
  '\\cite{',
  '\\label{',
  // Bibliography
  '\\bibliography',
  '\\bibliographystyle',
  '\\addbibresource',
  // Beamer
  '\\begin{frame}',
  '\\end{frame}',
  '\\frametitle',
  '\\begin{block}',
  // Short non-math snippets
  'scale=',
  'xscale=',
  'yscale=',
]

function extractLatex(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  return code?.textContent || pre.textContent || ''
}

function shouldSkip(latex: string): boolean {
  return SKIP_PATTERNS.some((p) => latex.includes(p))
}

function extractMathBlocks(latex: string): string[] {
  const trimmed = latex.trim()

  // One or more sequential top-level environments: \begin{xxx}...\end{xxx}
  // (loops so a block showing several examples back-to-back, e.g. all the
  // amsmath matrix variants, previews every one instead of just the first)
  const blocks: string[] = []
  let remaining = trimmed
  while (true) {
    remaining = remaining.replace(/^\s+/, '')
    const envMatch = remaining.match(/^\\begin\{(\w+\*?)\}/)
    if (!envMatch) break
    const envName = envMatch[1]
    const endRe = new RegExp(String.raw`^\\end\{${envName.replace('*', '\\*')}\}`)
    const lines = remaining.split('\n')
    const endIdx = lines.findIndex((l) => endRe.test(l.trim()))
    if (endIdx <= 0) break
    blocks.push(lines.slice(0, endIdx + 1).join('\n').trim())
    remaining = lines.slice(endIdx + 1).join('\n')
  }
  if (blocks.length) return blocks

  // Display math: \[ ... \]
  if (trimmed.startsWith('\\[')) {
    const endIdx = trimmed.lastIndexOf('\\]')
    if (endIdx > 2) {
      return [trimmed.slice(2, endIdx).trim()]
    }
  }

  return [trimmed]
}

function renderKatex(latex: string): string {
  try {
    return renderToString(latex, {
      throwOnError: false,
      displayMode: true,
      trust: true,
    })
  } catch {
    return `<span style="color:red; font-size:0.9em">KaTeX render error</span>`
  }
}

const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
const EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`

function createToggleBlock(renderedHtml: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'katex-preview-wrapper'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'katex-toggle-btn'
  btn.innerHTML = `${EYE_OPEN}<span>Show Preview</span>`

  btn.addEventListener('click', () => {
    const output = wrapper.querySelector('.katex-preview-output') as HTMLElement | null
    if (output) {
      output.remove()
      btn.innerHTML = `${EYE_OPEN}<span>Show Preview</span>`
    } else {
      const div = document.createElement('div')
      div.className = 'katex-preview-output'
      div.innerHTML = renderedHtml
      wrapper.appendChild(div)
      btn.innerHTML = `${EYE_CLOSED}<span>Hide Preview</span>`
    }
  })

  wrapper.appendChild(btn)
  return wrapper
}

function isLatexBlock(pre: HTMLElement): boolean {
  const code = pre.querySelector('code')
  if (!code) return false
  const classList = code.className || pre.className || ''
  return classList.includes('language-latex') || classList.includes('lang-latex')
}

function processPreviews() {
  const pres = document.querySelectorAll('pre')
  for (const pre of pres) {
    if (!(pre instanceof HTMLElement)) continue
    if (pre.dataset.katexProcessed) continue
    if (!isLatexBlock(pre)) continue
    if (pre.parentElement?.classList.contains('katex-preview-wrapper')) continue

    const latex = extractLatex(pre)
    if (!latex.trim()) continue
    if (shouldSkip(latex)) continue

    const mathBlocks = extractMathBlocks(latex)
    const renderedHtml = mathBlocks
      .map(renderKatex)
      .join('<div style="height:0.75em"></div>')

    // Check if KaTeX actually rendered something meaningful
    if (renderedHtml.includes('katex-error')) continue

    const toggleBlock = createToggleBlock(renderedHtml)
    pre.parentNode?.insertBefore(toggleBlock, pre)
    pre.dataset.katexProcessed = 'true'
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export default defineNuxtPlugin((nuxtApp) => {
  // Page content renders inside a <Suspense> boundary (ContentRenderer is
  // async). app:suspense:resolve fires once that boundary has actually
  // settled, which page:finish does not reliably wait for — inserting
  // preview wrappers before it settles causes "Hydration node mismatch"
  // errors since the server-rendered HTML doesn't have them yet.
  nuxtApp.hook('app:suspense:resolve', () => {
    processPreviews()
  })

  nuxtApp.hook('page:transition:finish', () => {
    processPreviews()
  })

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(processPreviews, 100)
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }
})
