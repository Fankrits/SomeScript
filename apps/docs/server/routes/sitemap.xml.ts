import { getAvailableLocales, getCollectionsToQuery, isNavigationPath } from '../../lib/docus-content'

function inferSiteURL() {
  const url = (
    process.env.NUXT_PUBLIC_SITE_URL
    || process.env.NUXT_SITE_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_BRANCH_URL
    || process.env.VERCEL_URL
    || process.env.URL
    || process.env.CI_PAGES_URL
    || process.env.CF_PAGES_URL
  )

  return url ? `https://${url}` : undefined
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = inferSiteURL() || ''

  const availableLocales = getAvailableLocales(config.public)
  const collections = getCollectionsToQuery(undefined, availableLocales)

  if (availableLocales.length > 0) {
    for (const locale of availableLocales) {
      collections.push(`landing_${locale}`)
    }
  }
  else {
    collections.push('landing')
  }

  const urls = []

  for (const collection of collections) {
    try {
      const pages = await queryCollection(event, collection).all()

      for (const page of pages) {
        const meta = page.meta || {}
        const pagePath = page.path || '/'

        if (meta.sitemap === false) continue

        if (isNavigationPath(pagePath)) continue

        const urlEntry = { loc: pagePath }

        if (meta.modifiedAt && typeof meta.modifiedAt === 'string') {
          urlEntry.lastmod = meta.modifiedAt.split('T')[0]
        }

        urls.push(urlEntry)
      }
    }
    catch {
      // Collection might not exist, skip it
    }
  }

  const sitemap = generateSitemap(urls, siteUrl)

  setResponseHeader(event, 'content-type', 'application/xml')
  return sitemap
})

function generateSitemap(urls, siteUrl) {
  const urlEntries = urls
    .map((url) => {
      const loc = siteUrl ? `${siteUrl}${url.loc}` : url.loc
      let entry = `  <url>\n    <loc>${escapeXml(loc)}</loc>`

      if (url.lastmod) {
        entry += `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>`
      }

      entry += `\n  </url>`
      return entry
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
