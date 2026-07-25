export default defineAppConfig({
  header: {
    title: 'SomeScript Docs',
    logo: {
      light: '/logo.svg',
      dark: '/logo.svg',
      alt: 'SomeScript',
      class: '!h-10',
      display: 'wordmark',
      wordmark: {
        light: '/wordmark.svg',
        dark: '/wordmark-dark.svg',
      },
      favicon: '/favicon.ico',
    },
  },
  seo: {
    title: 'SomeScript Docs',
    titleTemplate: '%s | SomeScript Docs',
    description: 'Practical guidance for writing, typesetting, and publishing beautiful LaTeX documents with SomeScript.',
  },
  ui: {
    colors: {
      primary: 'teal',
      neutral: 'slate',
    },
  },
})
