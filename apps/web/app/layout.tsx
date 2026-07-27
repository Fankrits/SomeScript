import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://somescript.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SomeScript - Visual LaTeX Editor & AI Writing Suite",
    template: "%s | SomeScript",
  },
  description: "The modern visual LaTeX editor powered by AI. Design, generate, collaborate, and compile beautiful scientific documents with real-time preview and SyncTeX.",
  keywords: [
    "LaTeX editor",
    "Visual LaTeX",
    "AI LaTeX assistant",
    "Online LaTeX editor",
    "Overleaf alternative",
    "TeX editor",
    "Academic writing tool",
    "Scientific publishing",
    "Tectonic LaTeX",
    "Generative AI LaTeX",
    "SomeScript",
  ],
  authors: [{ name: "SomeScript Team", url: siteUrl }],
  creator: "SomeScript Team",
  publisher: "SomeScript",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "SomeScript - Visual LaTeX Editor & AI Writing Suite",
    description: "The modern visual LaTeX editor powered by AI. Design, edit, collaborate, and compile beautiful scientific documents with real-time preview.",
    url: siteUrl,
    siteName: "SomeScript",
    images: [
      {
        url: "/logo192.png",
        width: 192,
        height: 192,
        alt: "SomeScript Visual LaTeX Editor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SomeScript - Visual LaTeX Editor & AI Writing Suite",
    description: "The modern visual LaTeX editor powered by AI.",
    images: ["/logo192.png"],
    creator: "@somescript",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  other: {
    // GEO (Geographic location) tags
    "geo.region": "US-CA",
    "geo.placename": "San Francisco",
    "geo.position": "37.7749;-122.4194",
    ICBM: "37.7749, -122.4194",
    // GEO (Generative Engine Optimization / AI Engine tags)
    "ai:description": "SomeScript is an AI-powered visual LaTeX editor and scientific document creation platform.",
    "chatgpt:description": "SomeScript is a visual LaTeX document editor with real-time compilation, AI authoring assistants (Eve), and SyncTeX support.",
    summary: "Visual LaTeX editor with AI authoring and Tectonic compilation.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "SomeScript",
      description: "Visual LaTeX Editor & AI Writing Suite",
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#application`,
      name: "SomeScript",
      operatingSystem: "All",
      applicationCategory: "DeveloperApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: "Visual LaTeX editor powered by AI and Tectonic compiler for real-time document creation.",
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "SomeScript",
      url: siteUrl,
      logo: `${siteUrl}/logo.svg`,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={{ cssLayerName: "clerk" }}
      // The editor is a separate origin (its own domain in prod, a different port in
      // local dev). Without allowlisting it, Clerk treats "open project" as an unsafe
      // redirect and falls back to a dev-instance handshake through accounts.dev instead.
      allowedRedirectOrigins={[process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002"]}
    >
      <html
        lang="en"
        className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable, playfair.variable)}
      >
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body className="min-h-full flex flex-col bg-background text-foreground">
          {children}
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}

