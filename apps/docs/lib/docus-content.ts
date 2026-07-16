type LocaleLike = string | { code?: string | null } | null | undefined

type ConfigWithLocales = {
  i18n?: { locales?: LocaleLike[] }
  docus?: { filteredLocales?: Array<{ code?: string | null }> }
}

export function getAvailableLocales(config: ConfigWithLocales): string[] {
  if (config.docus?.filteredLocales) {
    return config.docus.filteredLocales
      .map(locale => locale.code)
      .filter((code): code is string => Boolean(code))
  }

  return config.i18n?.locales
    ? config.i18n.locales
        .map(locale => typeof locale === 'string' ? locale : locale?.code)
        .filter((code): code is string => Boolean(code))
    : []
}

export function getCollectionsToQuery(locale: string | undefined, availableLocales: string[]): string[] {
  if (locale && availableLocales.includes(locale)) {
    return [`docs_${locale}`]
  }

  return availableLocales.length > 0
    ? availableLocales.map(currentLocale => `docs_${currentLocale}`)
    : ['docs']
}

export function isNavigationPath(path: string): boolean {
  return path.endsWith('.navigation') || path.includes('/.navigation/')
}

export function getCollectionFromPath(path: string, availableLocales: string[]): string {
  const pathSegments = path.split('/').filter(Boolean)
  const firstSegment = pathSegments[0]

  if (firstSegment && availableLocales.includes(firstSegment)) {
    return `docs_${firstSegment}`
  }

  return 'docs'
}
