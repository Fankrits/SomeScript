import { fileURLToPath } from 'node:url'

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
  mcp: {
    enabled: false,
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
