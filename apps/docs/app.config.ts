export default defineAppConfig({
  header: {
    title: 'SomeScript Docs',
    github: false,
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
    button: {
      slots: {
        avatar: '!rounded-none !bg-transparent !ring-0',
      },
    },
    avatar: {
      slots: {
        root: '!rounded-none !bg-transparent !ring-0',
        image: '!rounded-none',
      },
    },
  },
  assistant: {
    floatingInput: true,
    explainWithAi: true,
    icons: {
      trigger: 'i-lucide-sparkles',
      explain: 'i-lucide-brain',
    },
  },
})
