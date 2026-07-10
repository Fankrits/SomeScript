import Link from "next/link";
import Image from "next/image";
import { Sparkles, ArrowRight, Code, FileText, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroMockup from "@/components/hero-mockup";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(15,76,92,0.06),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(229,218,205,0.4),transparent_50%)] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Image src="/logo.svg" alt="SomeScript Logo" width={36} height={36} className="h-9 w-9 -mr-1.5" />
          <span className="font-semibold text-lg tracking-tight text-foreground">
            SomeScript
          </span>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Dashboard
          </Link>
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-all shadow-md shadow-primary/10">
            <Link href="/dashboard">
              Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative py-12 lg:py-24 max-w-7xl mx-auto w-full">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Title and CTA */}
          <div className="text-left flex flex-col items-start gap-6 lg:gap-8 max-w-xl">
            
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold tracking-wide">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Introducing AI Typesetting Engine v2.0
            </div>

            {/* Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium font-serif tracking-tight leading-tight text-foreground">
              Research Deserves
              <span className="block mt-1 bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary/95 to-primary/80 font-serif">
                Perfection.
              </span>
            </h1>

            {/* Paragraph */}
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed font-light">
              Transform rough notes and PDF drafts into publication-ready LaTeX. Powered by a Senior Researcher AI that understands the math, not just the text.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mt-4">
              <Button asChild size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-6 rounded-lg text-base shadow-lg shadow-primary/15 transition-all font-semibold cursor-pointer">
                <Link href="/dashboard">
                  Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" />
                </Link>
              </Button>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-light px-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                No credit card required
              </div>
            </div>
          </div>

          {/* Right Column: Redesigned Interactive IDE Mockups */}
          <div className="w-full flex items-center justify-center">
            <HeroMockup />
          </div>
        </div>

        {/* Feature Grid Section */}
        <section className="mt-24 lg:mt-36 w-full grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-sm flex flex-col gap-4 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Code className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg text-foreground font-serif">AI Generation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-light">
              Prompt for document outlines, complex math environments, tables, or bibliographies and watch them build instantly.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-sm flex flex-col gap-4 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-lg text-foreground font-serif">Tectonic Compilation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-light">
              Fast, on-demand compilation that runs on high-speed servers and outputs premium PDF formats directly in your browser.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-sm flex flex-col gap-4 shadow-sm">
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
      <footer className="border-t border-border py-8 px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4 mt-auto bg-card/20 z-10">
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
