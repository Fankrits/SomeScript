import type { Plugin } from 'unified'

export const remarkKatexPreview: Plugin<[], any> = () => {
  return (tree: any) => {
    const children = tree.children
    const toRemove = new Set<number>()
    let replacements = 0

    for (let i = 0; i < children.length; i++) {
      const node = children[i]

      // Look for HTML comment <!-- katex-preview -->
      if (
        node.type === 'html' &&
        typeof node.value === 'string' &&
        node.value.includes('katex-preview')
      ) {
        // Find the next code block with lang "latex"
        let j = i + 1
        while (j < children.length) {
          const next = children[j]
          if (next.type === 'code' && next.lang === 'latex') {
            break
          }
          // Skip blank text nodes between marker and code
          if (next.type === 'text' && !next.value?.trim()) {
            j++
            continue
          }
          break
        }

        const codeNode = children[j]
        if (codeNode && codeNode.type === 'code' && codeNode.lang === 'latex') {
          const latex = extractFirstFormula(codeNode.value)

          // Replace the comment node with the component
          children[i] = {
            type: 'html',
            value: `<LatexPreview latex={${JSON.stringify(latex)}} />`,
          }

          // Mark code block for removal
          toRemove.add(j)
          replacements++
        }
      }
    }

    console.log(`[remark-katex-preview] Found ${replacements} markers to transform`)

    // Remove marked nodes (iterate in reverse to preserve indices)
    if (toRemove.size > 0) {
      const indices = Array.from(toRemove).sort((a, b) => b - a)
      for (const idx of indices) {
        children.splice(idx, 1)
      }
    }
  }
}

function extractFirstFormula(code: string): string {
  const lines = code.split('\n')

  // If the entire block is a single environment like \begin{equation}...\end{equation}
  const envPattern = /^\\begin\{(\w+)\}/
  const envMatch = lines[0]?.trim().match(envPattern)
  if (envMatch) {
    const envName = envMatch[1]
    const endPattern = new RegExp(String.raw`^\\end\{${envName}\}`)
    const endIdx = lines.findIndex((l) => endPattern.test(l.trim()))
    if (endIdx > 0) {
      return lines.slice(0, endIdx + 1).join('\n').trim()
    }
  }

  // Return the full code — KaTeX will render what it can
  return code.trim()
}
