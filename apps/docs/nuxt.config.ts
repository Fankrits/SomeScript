import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Ensure AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN is present in process.env for Docus assistant module
if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  for (const envFile of ['.env', '.env.local']) {
    const fullPath = resolve(process.cwd(), envFile)
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf-8')
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?([^"'\r\n]+)["']?/)
        if (match && match[1] && match[2]) {
          process.env[match[1]] = process.env[match[1]] || match[2]
        }
      }
    }
  }
}

const defaultSiteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3003'

export default defineNuxtConfig({
  extends: ['docus'],
  alias: {
    'docus/server/utils/content': fileURLToPath(new URL('./lib/docus-content.ts', import.meta.url)),
  },
  css: [
    'katex/dist/katex.min.css',
    fileURLToPath(new URL('./assets/css/katex-preview.css', import.meta.url)),
    fileURLToPath(new URL('./assets/css/somescript.css', import.meta.url)),
  ],
  content: {
    build: {
      markdown: {
        remarkPlugins: {
          'remark-math': {
            options: {
              singleDollarTextMath: true,
            },
          },
        },
        rehypePlugins: {
          'rehype-katex': {},
        },
      },
    },
  },
  docus: {
    assistant: {
      model: 'inclusionai/ling-3.0-flash-free,meta/llama-3.1-8b',
      mcpServer: '/mcp',
      apiPath: '/__docus__/assistant',
    },
    skills: {
      dir: 'skills',
    },
  },
  mcp: {
    enabled: true,
  },
  site: {
    url: defaultSiteUrl,
    name: 'SomeScript Docs',
  },
  llms: {
    domain: defaultSiteUrl,
  },
  vite: {
    optimizeDeps: {
      include: [],
    },
  },
  nitro: {
    externals: {
      inline: ['docus'],
    },
  },
})
