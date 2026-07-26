# How It Works Sticky Scroll Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the How It Works section on the landing page into a sticky scroll-driven interactive showcase with smooth animated step cards.

**Architecture:** 
A multi-viewport scroll track (`h-[350vh]`) contains a sticky top viewport (`sticky top-0 h-screen`). As the user scrolls, `motion/react` `useScroll` maps `scrollYProgress` to the active step index. A split-screen layout renders step descriptions and interactive progress indicators on the left, while driving dynamic step animations on the right sandbox stage.

**Tech Stack:** Next.js 16, React 19, `motion/react` (Framer Motion), Tailwind CSS, Lucide Icons, `LiquidGlassCard`.

## Global Constraints

- **Spec Document**: `docs/superpowers/specs/2026-07-26-how-it-works-sticky-redesign-design.md`
- **Framework & Libraries**: Next.js App Router (`apps/web`), `motion/react` for scroll animations, Lucide React icons.
- **Type Safety**: `bun x tsc --noEmit` inside `apps/web` must pass with zero type errors.

---

### Task 1: Create Step Canvas Animation Subcomponents

**Files:**
- Create: `apps/web/components/sections/how-it-works-canvases.tsx`

**Interfaces:**
- Consumes: `LiquidGlassCard` from `@/components/kokonutui/liquid-glass-card`, `motion/react`, Lucide icons.
- Produces: 
  - `Step1WritePromptCanvas`: Animated typing LaTeX code editor snippet.
  - `Step2EveAiCanvas`: Eve AI chat card with status chips.
  - `Step3TectonicCompileCanvas`: Real-time compilation status and PDF preview skeleton.
  - `Step4ExportShareCanvas`: Interactive download PDF and collaborator invite cards.

- [ ] **Step 1: Create `apps/web/components/sections/how-it-works-canvases.tsx`**

Write the canvas subcomponents:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Terminal, Sparkles, CheckCircle2, FileCheck2, Download, Share2 } from "lucide-react";
import { LiquidGlassCard } from "@/components/kokonutui/liquid-glass-card";

export function Step1WritePromptCanvas() {
  const fullText = "\\begin{equation}\n  R = \\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}\n\\end{equation}";
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setDisplayedText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 35);
    return () => clearInterval(interval);
  }, []);

  return (
    <LiquidGlassCard className="w-full border-border bg-background/90 p-5 font-mono text-xs text-foreground shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-border pb-3 mb-4 text-foreground/50">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground/70">matrix_rotation.tex</span>
      </div>
      <div className="space-y-1.5 text-foreground/90 font-mono leading-relaxed min-h-[140px]">
        <p className="text-foreground/40 font-sans italic mb-2">{"// Prompt: Write a 2D rotation matrix in standard LaTeX"}</p>
        <pre className="whitespace-pre-wrap font-mono text-emerald-600 dark:text-emerald-400">
          {displayedText}
          <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
        </pre>
      </div>
    </LiquidGlassCard>
  );
}

export function Step2EveAiCanvas() {
  return (
    <LiquidGlassCard className="w-full border-border bg-background/90 p-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-inner">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Eve AI Co-Author</p>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Active Assistant</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed bg-foreground/5 border border-border p-3.5 rounded-xl font-light">
            &ldquo;I have drafted the TikZ coordinate diagram and populated the bibliography keys from your imported references.&rdquo;
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> TikZ Code Generated
            </span>
            <span className="text-[11px] bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> BibTeX Keys Synced
            </span>
          </div>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export function Step3TectonicCompileCanvas() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
      <LiquidGlassCard className="border-border bg-background/90 p-5 flex flex-col justify-center items-center text-center shadow-xl backdrop-blur-md">
        <FileCheck2 className="h-10 w-10 text-primary mb-3 animate-bounce" />
        <span className="text-sm font-semibold text-foreground">Tectonic Engine</span>
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">Status: Success (0.12s)</span>
        <div className="w-full bg-foreground/10 h-1.5 rounded-full mt-3 overflow-hidden">
          <motion.div 
            className="bg-primary h-full rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </LiquidGlassCard>
      <LiquidGlassCard className="border-border bg-white dark:bg-zinc-950 p-4 rounded-2xl shadow-xl flex flex-col justify-between aspect-[4/3]">
        <div className="border-b border-border pb-2 text-center">
          <span className="text-[10px] font-bold text-primary tracking-wide">main.pdf (Preview)</span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center gap-2 my-2">
          <div className="h-1.5 bg-foreground/10 w-3/4 rounded-full" />
          <div className="h-1.5 bg-foreground/10 w-5/6 rounded-full" />
          <div className="h-6 bg-primary/10 border border-primary/20 w-3/4 rounded-lg my-1 flex items-center justify-center px-2">
            <span className="text-[8px] font-mono text-primary font-semibold">R = [ cosθ -sinθ ; sinθ cosθ ]</span>
          </div>
        </div>
        <div className="h-1.5 bg-foreground/10 w-1/3 rounded-full self-start" />
      </LiquidGlassCard>
    </div>
  );
}

export function Step4ExportShareCanvas() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full">
      <LiquidGlassCard className="flex-1 border-border bg-background/90 p-5 flex items-center gap-4 shadow-xl backdrop-blur-md">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
          <Download className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Download PDF</p>
          <p className="text-xs text-foreground/60 mt-0.5">arXiv & IEEE compliant</p>
        </div>
      </LiquidGlassCard>
      <LiquidGlassCard className="flex-1 border-border bg-background/90 p-5 flex items-center gap-4 shadow-xl backdrop-blur-md">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
          <Share2 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Invite Collaborators</p>
          <p className="text-xs text-foreground/60 mt-0.5">Live multi-user sandboxes</p>
        </div>
      </LiquidGlassCard>
    </div>
  );
}
```

- [ ] **Step 2: Run type check to verify canvas subcomponents**

Run: `bun x tsc --noEmit` inside `apps/web`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit canvas subcomponents**

```bash
git add apps/web/components/sections/how-it-works-canvases.tsx
git commit -m "feat(web): create canvas animation subcomponents for How It Works section"
```

---

### Task 2: Redesign `HowItWorks` into Sticky Scroll Split-Screen Showcase

**Files:**
- Modify: `apps/web/components/sections/how-it-works.tsx`

**Interfaces:**
- Consumes: Canvas subcomponents from `@/components/sections/how-it-works-canvases`, `motion/react`, `useScroll`, `useTransform`, `useMotionValueEvent`.
- Produces: React component `HowItWorks()`.

- [ ] **Step 1: Update `apps/web/components/sections/how-it-works.tsx`**

```tsx
"use client";

import React, { useRef, useState } from "react";
import { useScroll, useMotionValueEvent, motion, AnimatePresence } from "motion/react";
import {
  Step1WritePromptCanvas,
  Step2EveAiCanvas,
  Step3TectonicCompileCanvas,
  Step4ExportShareCanvas,
} from "./how-it-works-canvases";

const steps = [
  {
    number: "01",
    title: "Write & Prompt",
    description: "Start typing standard LaTeX directly, or describe what you need in plain English. SomeScript supports standard document classes and math environments natively.",
    canvas: <Step1WritePromptCanvas />,
  },
  {
    number: "02",
    title: "AI Co-Authoring",
    description: "Our embedded AI co-author, Eve, processes your requests and instantly generates outline structures, complex mathematical formulas, formatted tables, and structured bibliographies.",
    canvas: <Step2EveAiCanvas />,
  },
  {
    number: "03",
    title: "Instant Compile",
    description: "The background Tectonic engine compiles your project on-the-fly. The visual editor updates in real time with page-accurate previews of math, layout, and images as you type.",
    canvas: <Step3TectonicCompileCanvas />,
  },
  {
    number: "04",
    title: "Export & Share",
    description: "Download your final typeset, publication-ready PDF document, or invite your co-authors and research collaborators to join your shared isolated sandboxes.",
    canvas: <Step4ExportShareCanvas />,
  },
];

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.25) {
      setActiveStep(0);
    } else if (latest < 0.5) {
      setActiveStep(1);
    } else if (latest < 0.75) {
      setActiveStep(2);
    } else {
      setActiveStep(3);
    }
  });

  return (
    <section id="how-it-works" className="w-full border-t border-border/40 relative z-10">
      {/* Scroll track container */}
      <div ref={containerRef} className="relative h-[320vh] bg-background">
        {/* Sticky viewport frame */}
        <div className="sticky top-0 h-screen flex flex-col justify-center max-w-7xl mx-auto px-6 py-12 overflow-hidden">
          {/* Header */}
          <div className="text-center mb-8 shrink-0">
            <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight text-foreground">
              How It Works
            </h2>
            <p className="mt-2 text-sm sm:text-base text-foreground/70 font-light max-w-xl mx-auto">
              From prompt or scratch draft to a publication-ready PDF in minutes.
            </p>
          </div>

          {/* Main Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center flex-1 max-h-[600px]">
            {/* Left Column: Steps List */}
            <div className="lg:col-span-5 flex flex-col gap-6 justify-center">
              {steps.map((step, idx) => {
                const isActive = activeStep === idx;
                return (
                  <div
                    key={step.number}
                    className={`transition-all duration-300 p-4 rounded-xl border ${
                      isActive
                        ? "bg-foreground/5 border-primary/30 shadow-md scale-[1.02]"
                        : "bg-transparent border-transparent opacity-40 hover:opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        isActive ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground/60"
                      }`}>
                        {step.number}
                      </span>
                      <h3 className="text-lg font-serif font-medium text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 text-xs sm:text-sm text-foreground/80 leading-relaxed font-light pl-9"
                      >
                        {step.description}
                      </motion.p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Column: Dynamic Stage Canvas */}
            <div className="lg:col-span-7 flex items-center justify-center min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="w-full flex justify-center"
                >
                  {steps[activeStep].canvas}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `bun x tsc --noEmit` inside `apps/web`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit updated `HowItWorks` component**

```bash
git add apps/web/components/sections/how-it-works.tsx
git commit -m "feat(web): implement sticky scroll split-screen How It Works section"
```

---

### Task 3: Verification & Build Check

**Files:**
- None (verification phase)

- [ ] **Step 1: Run full monorepo typecheck**

Run: `bun x tsc --noEmit` inside `apps/web`
Expected: Clean output with 0 errors.

- [ ] **Step 2: Commit plan completion checkpoint**

```bash
git commit --allow-empty -m "docs: completed sticky scroll How It Works section redesign"
```
