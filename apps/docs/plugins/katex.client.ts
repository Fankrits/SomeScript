import { defineNuxtPlugin, onNuxtReady } from '#app'
import { renderToString } from 'katex'

const AUTO_PREVIEW_ENVIRONMENTS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'alignat',
  'alignat*',
  'array',
  'cases',
  'dcases',
  'dcases*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'smallmatrix',
  'aligned',
  'alignedat',
  'gathered',
  'split',
])

const BLOCKED_SOURCE_PATTERNS = [
  /\\(?:documentclass|usepackage|newcommand|renewcommand|providecommand|Declare\w*|section|subsection|chapter|caption|includegraphics|input|bibliography|bibliographystyle|setlength|setcounter|numberwithin|pagestyle|thispagestyle|label|ref|eqref|intertext)\b/,
  /\\begin\{(?:document|figure\*?|table\*?|tabular\*?|tikzpicture|pspicture|algorithm\*?|algorithmic|lstlisting|verbatim|minted|minipage|frame)\}/,
  /\\(?:draw|path|node|fill|filldraw|clip|coordinate|psset|rput|psline|psframe)\b/,
]

const FORMULA_SOURCE_PATTERN = /(?:[A-Za-z]\w*\([^)]*\)\s*=)|\\(?:left|right|frac|dfrac|tfrac|sqrt|sum|prod|int|lim|overbrace|underbrace|operatorname|boxed|mathbb|begin\{cases\})\b/

function extractLatex(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  return code?.textContent || pre.textContent || ''
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

function renderKatex(latex: string): string | null {
  try {
    return renderToString(latex, {
      throwOnError: true,
      displayMode: true,
    })
  } catch {
    return null
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

function getPreviewSource(pre: HTMLElement): string | null {
  const code = pre.querySelector('code')
  if (!code) return null
  const classList = code.className || pre.className || ''
  const isLatex = classList.includes('language-latex')
    || classList.includes('lang-latex')
    || classList.includes('language-tex')
    || classList.includes('lang-tex')
  if (!isLatex) return null

  const source = extractLatex(pre)
  const trimmed = source.trim()
  if (BLOCKED_SOURCE_PATTERNS.some(pattern => pattern.test(trimmed))) return null

  // Formula-only fences are detected from their delimiters, math environments,
  // or formula syntax. The KaTeX render check below is the final guard.
  if (/^\\\[/.test(trimmed) && /\\\]\s*$/.test(trimmed)) return source

  const environmentTokens = [...trimmed.matchAll(/\\(begin|end)\{([A-Za-z]+\*?)\}/g)]
  if (
    environmentTokens.length > 0
    && environmentTokens.every(([, , environment]) => AUTO_PREVIEW_ENVIRONMENTS.has(environment))
    && environmentTokens.filter(([, type]) => type === 'begin').length
      === environmentTokens.filter(([, type]) => type === 'end').length
  ) {
    return source
  }

  return FORMULA_SOURCE_PATTERN.test(trimmed) ? source : null
}

function processPreviews() {
  const pres = document.querySelectorAll('pre')
  for (const pre of pres) {
    if (!(pre instanceof HTMLElement)) continue
    if (pre.dataset.katexProcessed) continue
    if (pre.parentElement?.classList.contains('katex-preview-wrapper')) continue

    const latex = getPreviewSource(pre)
    if (!latex?.trim()) continue

    const mathBlocks = extractMathBlocks(latex)
    const renderedBlocks = mathBlocks.map(renderKatex)
    if (renderedBlocks.some(block => block === null)) continue
    const renderedHtml = renderedBlocks.join('<div style="height:0.75em"></div>')

    const toggleBlock = createToggleBlock(renderedHtml)
    pre.parentNode?.insertBefore(toggleBlock, pre)
    pre.dataset.katexProcessed = 'true'
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function schedulePreviews() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(processPreviews, 100)
}

export default defineNuxtPlugin((nuxtApp) => {
  // The server does not render preview controls. Defer the initial enhancement
  // until Nuxt has completed client hydration, then rerun after each async page
  // component resolves during client-side navigation.
  onNuxtReady(schedulePreviews)
  nuxtApp.hook('page:finish', schedulePreviews)
})
