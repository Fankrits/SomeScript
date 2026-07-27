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
  modules: ['@vercel/analytics/nuxt'],
  alias: {
    'docus/server/utils/content': fileURLToPath(new URL('./lib/docus-content.ts', import.meta.url)),
  },
  app: {
    head: {
      title: 'SomeScript Docs - Visual LaTeX Editor & AI Writing Suite',
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Practical guidance for writing, typesetting, and publishing beautiful LaTeX documents with SomeScript.' },
        { name: 'keywords', content: 'SomeScript docs, LaTeX guide, visual LaTeX editor, AI writing assistant, Eve AI agent, SyncTeX, Tectonic compiler' },
        { name: 'author', content: 'SomeScript Team' },
        // OpenGraph
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'SomeScript Docs' },
        { property: 'og:title', content: 'SomeScript Docs - Visual LaTeX Editor & AI Writing Suite' },
        { property: 'og:description', content: 'Practical guidance for writing, typesetting, and publishing beautiful LaTeX documents with SomeScript.' },
        { property: 'og:image', content: '/mountains.webp' },
        // Twitter
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'SomeScript Docs' },
        { name: 'twitter:description', content: 'Practical guidance for writing, typesetting, and publishing beautiful LaTeX documents.' },
        { name: 'twitter:image', content: '/mountains.webp' },
        // GEO (Geographic Location) Tags
        { name: 'geo.region', content: 'US-CA' },
        { name: 'geo.placename', content: 'San Francisco' },
        { name: 'geo.position', content: '37.7749;-122.4194' },
        { name: 'ICBM', content: '37.7749, -122.4194' },
        // GEO (Generative Engine Optimization / AI Search)
        { name: 'ai:description', content: 'Official documentation for SomeScript visual LaTeX editor and Eve AI authoring system.' },
        { name: 'chatgpt:description', content: 'Complete user guides, syntax references, API docs, and AI workflows for SomeScript visual LaTeX suite.' },
        { name: 'summary', content: 'SomeScript documentation and user guide.' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
      script: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebSite',
                '@id': `${defaultSiteUrl}/#website`,
                url: defaultSiteUrl,
                name: 'SomeScript Docs',
                description: 'Official Documentation for SomeScript Visual LaTeX Editor',
              },
              {
                '@type': 'TechArticle',
                name: 'SomeScript Documentation',
                description: 'Comprehensive guides, tutorials, and technical manuals for SomeScript LaTeX platform.',
                inLanguage: 'en',
              },
            ],
          }),
        },
      ],
    },
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
