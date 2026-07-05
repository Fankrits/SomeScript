const defaultSiteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3003'

export default defineNuxtConfig({
  extends: ['docus'],
  alias: {
    'docus/server/utils/content': '/Users/fankrits/dev/SomeScript-adv/apps/docs/lib/docus-content.ts',
  },
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
