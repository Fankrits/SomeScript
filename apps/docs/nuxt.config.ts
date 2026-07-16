import { fileURLToPath } from 'node:url'

const defaultSiteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3003'

export default defineNuxtConfig({
  extends: ['docus'],
  alias: {
    'docus/server/utils/content': fileURLToPath(new URL('./lib/docus-content.ts', import.meta.url)),
  },
  css: ['katex/dist/katex.min.css', '~/assets/css/katex-preview.css'],
  mcp: {
    enabled: false,
  },
  site: {
    url: defaultSiteUrl,
    name: 'LaTeX Guide',
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
