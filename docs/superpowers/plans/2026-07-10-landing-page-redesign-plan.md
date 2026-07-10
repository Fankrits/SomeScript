# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the SomeScript landing page with premium serif typography and a layered, interactive LaTeX Editor and PDF Preview mockup showing an auto-typing compilation animation.

**Architecture:** Add Google's `Playfair_Display` serif font for high-end editorial styling of headers. Implement `<HeroMockup />` under `apps/web/components` using absolute overlapping positioning (Option B) and a React hook state timer loop to animate the typing, compiling, and success-rendering.

**Tech Stack:** Next.js v16, Tailwind CSS v4, Lucide Icons.

## Global Constraints
* Maintain existing theme color variables (`--background` cream, `--primary` teal, `--accent` warm grey) defined in `globals.css`.
* Do not add heavy external libraries for animations; use React state hooks and standard CSS transitions.
* Ensure type safety by running `bun x tsc --noEmit` after updates.

---

### Task 1: Integrate Serif Typography
Add the Playfair Display serif font to the Next.js page layout and verify CSS classes compile.

**Files:**
* Modify: `apps/web/app/layout.tsx`
* Modify: `apps/web/app/globals.css`

**Interfaces:**
* Produces: A new global utility class `font-serif` mapped to the Google Serif font variable.

- [ ] **Step 1: Import Google Serif Font**
  Modify `apps/web/app/layout.tsx` to import and load `Playfair_Display` under the CSS variable `--font-serif`.
  
  Replace the existing import and font initialization in `apps/web/app/layout.tsx`:
  ```typescript
  // Find line:
  import { Geist, Geist_Mono, Inter } from "next/font/google";
  ```
  with:
  ```typescript
  import { Geist, Geist_Mono, Inter, Playfair_Display } from "next/font/google";
  ```

  And add the configuration:
  ```typescript
  const playfair = Playfair_Display({
    variable: "--font-serif",
    subsets: ["latin"],
  });
  ```

  Then include `playfair.variable` in the list of classes on the `html` element:
  ```typescript
  <html
    lang="en"
    className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable, playfair.variable)}
  >
  ```

- [ ] **Step 2: Add font variable config to tailwind theme**
  Open `apps/web/app/globals.css` and map the font variable under the `@theme` block.
  Add `--font-serif: var(--font-serif);` and `--font-heading: var(--font-serif);` inside `@theme inline`:
  ```css
  @theme inline {
    /* ... existing variable mappings ... */
    --font-serif: var(--font-serif);
    --font-heading: var(--font-serif);
  }
  ```

- [ ] **Step 3: Verify TypeScript compilation**
  Run: `bun x tsc --noEmit` inside `apps/web/`
  Expected output: Exit code 0 (no TypeScript issues).

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add apps/web/app/layout.tsx apps/web/app/globals.css
  git commit -m "style: integrate Playfair Display serif font"
  ```

---

### Task 2: Create HeroMockup Component
Write a new React component `HeroMockup` containing the design elements (macOS window controls, line numbers, abstract code bars, interactive LaTeX text line) and the React animation state-machine loop.

**Files:**
* Create: `apps/web/components/hero-mockup.tsx`

**Interfaces:**
* Produces: `<HeroMockup />` React component exported as default.

- [ ] **Step 1: Create the file**
  Write the complete code for `apps/web/components/hero-mockup.tsx`:
  ```typescript
  "use client";

  import React, { useState, useEffect } from "react";
  import { Loader2, CheckCircle2, FileText, Settings, Search } from "lucide-react";

  const FORMULA = "  \\int_{a}^{b} f(x) \\, dx = F(b) - F(a)";

  type Phase = "typing" | "compiling" | "success" | "reset";

  export default function HeroMockup() {
    const [phase, setPhase] = useState<Phase>("typing");
    const [typedText, setTypedText] = useState("");
    const [charIndex, setCharIndex] = useState(0);

    // Dynamic typing and state machine effect
    useEffect(() => {
      let timer: NodeJS.Timeout;

      if (phase === "typing") {
        if (charIndex < FORMULA.length) {
          timer = setTimeout(() => {
            setTypedText((prev) => prev + FORMULA[charIndex]);
            setCharIndex((prev) => prev + 1);
          }, 80);
        } else {
          // Pause briefly, then start compiling
          timer = setTimeout(() => {
            setPhase("compiling");
          }, 600);
        }
      } else if (phase === "compiling") {
        // Mock compile delay
        timer = setTimeout(() => {
          setPhase("success");
        }, 1500);
      } else if (phase === "success") {
        // Display result for 5 seconds before reset
        timer = setTimeout(() => {
          setPhase("reset");
        }, 5000);
      } else if (phase === "reset") {
        setTypedText("");
        setCharIndex(0);
        setPhase("typing");
      }

      return () => clearTimeout(timer);
    }, [phase, charIndex]);

    return (
      <div className="relative w-full aspect-video md:aspect-[4/3] max-w-2xl mx-auto flex items-center justify-center p-4 lg:p-8 select-none perspective-1000">
        
        {/* Window 2: PDF Preview (Background Layer) */}
        <div className={`absolute top-0 right-4 w-[60%] bg-white border border-[#e5dacd] rounded-xl shadow-2xl p-6 transition-all duration-700 font-sans z-10 ${
          phase === "success" 
            ? "translate-x-1 -translate-y-1 scale-102 ring-2 ring-emerald-500/20 border-emerald-300" 
            : "translate-x-0 translate-y-0 scale-100 opacity-90"
        }`}>
          {/* Header section representing standard LaTeX document preview */}
          <div className="border-b border-[#e5dacd]/60 pb-3 mb-4 text-center">
            <h4 className="text-[11px] font-semibold text-[#0f4c5c] uppercase tracking-wider">
              main.pdf
            </h4>
            <h2 className="text-[14px] font-bold text-[#1c2e36] mt-2 font-serif">
              Fundamental Theorem of Calculus
            </h2>
            <p className="text-[8px] text-[#5a737e] mt-1 italic">
              A. Researcher &bull; SomeScript Academy
            </p>
          </div>

          {/* Abstract layout using crisp vector bars */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold text-[#1c2e36]">Abstract</span>
              <div className="h-1 bg-[#efe7dd] rounded-full flex-1" />
            </div>
            <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
            <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[92%]" />
            <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[85%]" />
          </div>

          {/* Core math expression rendering block */}
          <div className="my-6 p-4 bg-[#FBF6F0] border border-[#e5dacd]/50 rounded-lg flex flex-col items-center justify-center min-h-[70px] transition-all duration-500 relative overflow-hidden">
            <div className="absolute top-2 left-2 text-[8px] font-mono text-[#5a737e]/60">
              [Equation 1]
            </div>
            
            {phase === "success" ? (
              <div className="w-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                <svg viewBox="0 0 240 60" className="w-full max-w-[200px] h-10 text-[#0f4c5c]" fill="currentColor">
                  {/* Integral Symbol */}
                  <path d="M12,10 C13,5 16,3 18,3 C20,3 21,5 21,7 C21,8 20,9 19,9 C18,9 18,8 18,7 C18,6 17,5 16,5 C14,5 13,10 11,25 L8,45 C7,50 6,53 5,53 C3,53 2,51 2,49 C2,48 3,47 4,47 C5,47 5,48 5,49 C5,50 6,51 7,51 C8,51 10,40 12,25 Z" transform="scale(0.85) translate(10, 2)" />
                  <text x="23" y="14" fontSize="10" fontStyle="italic" fontFamily="serif">b</text>
                  <text x="18" y="44" fontSize="10" fontStyle="italic" fontFamily="serif">a</text>
                  <text x="34" y="32" fontSize="15" fontStyle="italic" fontFamily="serif">f(x) dx</text>
                  <text x="88" y="32" fontSize="15" fontFamily="serif">=</text>
                  <text x="110" y="32" fontSize="15" fontStyle="italic" fontFamily="serif">F(b) — F(a)</text>
                </svg>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div className="h-2 bg-[#e5dacd]/40 rounded-full w-24 animate-pulse" />
                <span className="text-[9px] text-[#5a737e]/40 font-mono">
                  {phase === "compiling" ? "Rendering math..." : "Awaiting compilation"}
                </span>
              </div>
            )}
          </div>

          {/* Bottom paragraph preview */}
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-full" />
            <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[96%]" />
            <div className="h-1.5 bg-[#efe7dd]/70 rounded-full w-[60%]" />
          </div>
        </div>

        {/* Window 1: Code Editor (Foreground Layer) */}
        <div className="absolute bottom-0 left-4 w-[60%] bg-[#121c21]/95 backdrop-blur-md border border-[#2d8297]/20 rounded-xl shadow-2xl p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-3xl z-20 font-mono text-[11px] leading-relaxed">
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-[#2d8297]/10 pb-2.5 mb-3 select-none">
            {/* macOS Buttons */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
            </div>
            
            {/* Active/Inactive tabs */}
            <div className="flex items-center gap-2">
              <div className="bg-[#1a2b33] border border-[#2d8297]/15 px-3 py-1 rounded-md text-[10px] text-[#8cedc4] flex items-center gap-1.5 font-sans font-medium">
                <FileText className="w-3 h-3 text-[#2d8297]" />
                main.tex
              </div>
              <div className="px-2 py-1 text-[10px] text-[#5a737e] hover:text-[#8cedc4]/60 transition-colors font-sans">
                references.bib
              </div>
            </div>

            <div className="flex gap-1.5 text-[#5a737e]">
              <Search className="w-3 h-3" />
              <Settings className="w-3 h-3" />
            </div>
          </div>

          {/* Code Layout & Lines */}
          <div className="flex font-mono text-[10px]">
            {/* Line Numbers */}
            <div className="text-[#5a737e]/40 select-none pr-3.5 border-r border-[#2d8297]/10 text-right flex flex-col gap-1 w-6">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
              <span>7</span>
              <span>8</span>
              <span>9</span>
              <span>10</span>
            </div>

            {/* Code Lines Body */}
            <div className="pl-3.5 flex-1 flex flex-col gap-1 text-[#cbd2d6]">
              {/* Line 1: preamble */}
              <div className="flex items-center gap-1.5">
                <span className="text-[#c3c4f9]">\documentclass</span>
                <span className="text-[#cbd2d6]">&#123;article&#125;</span>
              </div>
              
              {/* Line 2: packages */}
              <div className="flex items-center gap-1.5">
                <span className="text-[#c3c4f9]">\usepackage</span>
                <span className="text-[#cbd2d6]">&#123;amsmath&#125;</span>
              </div>
              
              {/* Line 3: abstract lines representing metadata */}
              <div className="h-2 flex items-center my-0.5">
                <div className="h-1 bg-[#5a737e]/30 rounded-full w-24" />
              </div>

              {/* Line 4: begin document */}
              <div className="flex items-center gap-1.5">
                <span className="text-[#ffafba]">\begin</span>
                <span className="text-[#cbd2d6]">&#123;document&#125;</span>
              </div>

              {/* Line 5: sections */}
              <div className="flex items-center gap-1.5 pl-3">
                <span className="text-[#96dcf8]">\section</span>
                <span className="text-[#cbd2d6]">&#123;Introduction&#125;</span>
              </div>

              {/* Line 6: abstract block */}
              <div className="h-2 flex items-center my-0.5 pl-3">
                <div className="h-1 bg-[#5a737e]/30 rounded-full w-36" />
              </div>

              {/* Line 7: begin equation */}
              <div className="flex items-center gap-1.5 pl-3">
                <span className="text-[#ffafba]">\begin</span>
                <span className="text-[#cbd2d6]">&#123;equation&#125;</span>
              </div>

              {/* Line 8: The Typed Math Formula */}
              <div className="text-[#8cedc4] font-medium flex items-center min-h-[14px]">
                <span className="whitespace-pre">{typedText}</span>
                <span className="w-1 h-3.5 bg-[#8cedc4] ml-0.5 animate-pulse" />
              </div>

              {/* Line 9: end equation */}
              <div className="flex items-center gap-1.5 pl-3">
                <span className="text-[#ffafba]">\end</span>
                <span className="text-[#cbd2d6]">&#123;equation&#125;</span>
              </div>

              {/* Line 10: end document */}
              <div className="flex items-center gap-1.5">
                <span className="text-[#ffafba]">\end</span>
                <span className="text-[#cbd2d6]">&#123;document&#125;</span>
              </div>
            </div>
          </div>

          {/* Editor Status Bar */}
          <div className="mt-4 pt-2.5 border-t border-[#2d8297]/10 flex items-center justify-between text-[9px] text-[#5a737e] select-none">
            <div className="flex items-center gap-3">
              <span>LaTeX</span>
              <span>UTF-8</span>
              <span>Ln 8, Col {typedText.length + 1}</span>
            </div>

            {/* Compiler Status Badge */}
            <div className="flex items-center gap-1.5">
              {phase === "typing" && (
                <div className="flex items-center gap-1 text-[#96dcf8] bg-[#96dcf8]/10 border border-[#96dcf8]/20 px-1.5 py-0.5 rounded text-[8px] font-sans">
                  Editing
                </div>
              )}
              {phase === "compiling" && (
                <div className="flex items-center gap-1 text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded text-[8px] font-sans animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Compiling...
                </div>
              )}
              {phase === "success" && (
                <div className="flex items-center gap-1 text-[#8cedc4] bg-[#8cedc4]/10 border border-[#8cedc4]/20 px-1.5 py-0.5 rounded text-[8px] font-sans">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Success
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    );
  }
  ```

- [ ] **Step 2: Verify component compiles**
  Run: `bun x tsc --noEmit` inside `apps/web/`
  Expected output: Exit code 0.

- [ ] **Step 3: Commit component**
  Run:
  ```bash
  git add apps/web/components/hero-mockup.tsx
  git commit -m "feat: add HeroMockup component with typing compilation animation"
  ```

---

### Task 3: Redesign Landing Page Layout & typography
Integrate `<HeroMockup />` into the main landing page, update headings with premium serif styling, and align grids.

**Files:**
* Modify: `apps/web/app/page.tsx`

**Interfaces:**
* Consumes: `<HeroMockup />` from `@/components/hero-mockup`

- [ ] **Step 1: Replace layout and add HeroMockup**
  Modify `apps/web/app/page.tsx` to:
  1. Import `HeroMockup` at the top of the file.
  2. Change main headings to utilize the new serif (`font-serif`) font and styling.
  3. Divide the main body hero section into a responsive 2-column layout.
  4. Embed `<HeroMockup />` inside the right-hand column.

  Update the main layout in `apps/web/app/page.tsx` to match:
  ```typescript
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
  ```

- [ ] **Step 2: Verify page build**
  Run: `bun run build` inside `apps/web/`
  Expected output: Success compile and build of NextJS site.

- [ ] **Step 3: Commit code changes**
  Run:
  ```bash
  git add apps/web/app/page.tsx
  git commit -m "feat: integrate HeroMockup component and update page styling"
  ```
