import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SomeScript Editor",
    template: "%s | SomeScript",
  },
  description: "Write, compile, and preview beautiful LaTeX documents with SomeScript.",
  applicationName: "SomeScript",
};

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        {/* Keeps clerk-js mounted on this app so the short-lived session token is
            refreshed while using the editor; without it, fetch() calls start
            returning 401 ~60s after the last page-level Clerk handshake. */}
        <ClerkProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
