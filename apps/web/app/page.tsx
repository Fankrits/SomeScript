import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Code, FileText, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuroraText } from "@/components/ui/aurora-text";
import HeroMockup from "@/components/hero-mockup";
import HeroBackground from "@/components/hero-background";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-hidden">
      {/* Animated WebGL Gradient Background */}
      <HeroBackground />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-transparent px-6 flex h-[72px] items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Image src="/logo.svg" alt="SomeScript Logo" width={36} height={36} className="h-9 w-9 -mr-1.5" />
          <span className="font-semibold text-lg tracking-tight text-white">
            SomeScript
          </span>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Dashboard
          </Link>
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-all shadow-md shadow-primary/10">
            <Link href="/dashboard">
              Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero Section: sized to fit within one screen on desktop */}
      <section className="flex flex-col items-center justify-center px-6 relative w-full max-w-7xl mx-auto z-10 py-6 lg:h-[calc(100svh-72px)]">
        <div className="w-full max-w-6xl">
          <HeroMockup
            overlay={
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
                {/* Heading */}
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium font-serif tracking-tight leading-tight text-white">
                  <AuroraText colors={["#dd7e21", "#0f4c5c", "#8da0ce", "#dd7e21"]}>
                    Research Deserves
                    <br />
                    Perfection.
                  </AuroraText>
                </h1>

                {/* Paragraph */}
                <p className="text-sm sm:text-base text-white/80 leading-relaxed font-light max-w-xl">
                  Your AI co-author for flawless math, citations, and typesetting.
                </p>

                {/* CTA */}
                <div className="flex w-full justify-center">
                  <Button asChild size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 rounded-lg text-base shadow-lg shadow-primary/15 transition-all font-semibold cursor-pointer">
                    <Link href="/dashboard">
                      Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" />
                    </Link>
                  </Button>
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* Feature Grid Section */}
      <main className="flex-1 flex flex-col px-6 relative max-w-7xl mx-auto w-full z-10">
        <section className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 relative pb-20">
          <div className="p-6 rounded-xl border border-border/40 bg-card/90 backdrop-blur-md flex flex-col gap-4 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Code className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg text-foreground font-serif">AI Generation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-light">
              Prompt for document outlines, complex math environments, tables, or bibliographies and watch them build instantly.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border/40 bg-card/90 backdrop-blur-md flex flex-col gap-4 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg text-foreground font-serif">Tectonic Compilation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-light">
              Fast, on-demand compilation that runs on high-speed servers and outputs premium PDF formats directly in your browser.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border/40 bg-card/90 backdrop-blur-md flex flex-col gap-4 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg text-foreground font-serif">Workspace Isolation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-light">
              Organize your documents under professional workspaces (powered by Clerk) for simple collaboration and document history.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4 mt-auto bg-background/90 backdrop-blur-sm z-10">
        <span className="font-light">© 2026 SomeScript. All rights reserved.</span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-primary transition-colors">Terms</a>
          <a href="#" className="hover:text-primary transition-colors">Privacy</a>
          <a href="#" className="hover:text-primary transition-colors">Docs</a>
        </div>
      </footer>
    </div>
  );
}
