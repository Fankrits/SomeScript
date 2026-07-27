# Remove Background Animations & Unify Pure White Cream Background Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove WebGL 3D ShaderGradient canvas animation and Aurora text keyframe animations from `apps/web`, unifying all pages under the pure white cream background (`#FBF6F0` / `bg-background`).

**Architecture:** Replace dynamic `@shadergradient/react` WebGL elements in `HeroBackground` with a static background component matching the landing page's `bg-background` (`#FBF6F0`). Update `about`, `contact`, and `legal` pages to use `dark={false}` header, light cream cards (`bg-card border-border text-foreground shadow-sm`), and dark legible text. Update `final-cta.tsx` heading to static text.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Lucide React icons.

## Global Constraints

- Preserve all existing functionality, links, buttons, and responsive grid layouts.
- Match exact background color token (`bg-background`, `#FBF6F0`).
- Ensure no type errors when running `bun x tsc --noEmit` inside `apps/web/`.

---

### Task 1: Replace WebGL Shader Animation in `HeroBackground` & Default Header Dark Prop

**Files:**
- Modify: [apps/web/components/hero-background.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/components/hero-background.tsx)
- Modify: [apps/web/components/header.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/components/header.tsx)

- [ ] **Step 1: Simplify `hero-background.tsx`**

Replace WebGL `@shadergradient/react` with a clean static background overlay on `bg-background` (`#FBF6F0`).

```tsx
import React from "react";

export default function HeroBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`fixed inset-0 z-0 overflow-hidden pointer-events-none bg-background ${className}`} aria-hidden="true">
      <div
        className="absolute inset-0 w-full h-full opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 10% 25%, rgba(15,76,92,0.05) 0%, transparent 45%), radial-gradient(circle at 90% 75%, rgba(221,126,33,0.05) 0%, transparent 45%)",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update default `dark` prop in `header.tsx`**

In [apps/web/components/header.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/components/header.tsx):
Change `export default function Header({ dark = true }: { dark?: boolean })` to `export default function Header({ dark = false }: { dark?: boolean })`.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add apps/web/components/hero-background.tsx apps/web/components/header.tsx
git commit -m "refactor(web): replace WebGL shader background with static cream theme"
```

---

### Task 2: Refactor `about`, `contact`, and `legal` Subpages to Light Cream Theme

**Files:**
- Modify: [apps/web/app/about/page.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/app/about/page.tsx)
- Modify: [apps/web/app/contact/page.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/app/contact/page.tsx)
- Modify: [apps/web/app/legal/page.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/app/legal/page.tsx)

- [ ] **Step 1: Refactor `about/page.tsx`**

Update `Header` call, page titles (`text-foreground`, `text-muted-foreground`), and `LiquidGlassCard` styling (`border-border bg-card/80 text-card-foreground shadow-lg backdrop-blur-sm`). Update internal sub-cards and text to legible foreground colors.

- [ ] **Step 2: Refactor `contact/page.tsx`**

Update title to `text-foreground`, subtext to `text-muted-foreground`, card container to `bg-card border-border text-foreground shadow-lg`, and detail boxes from `bg-white/5` to `bg-secondary/40 border-border`.

- [ ] **Step 3: Refactor `legal/page.tsx`**

Update tab buttons to match light theme (`bg-secondary/60 text-foreground border-border` when inactive, `bg-primary text-primary-foreground` when active). Update titles to `text-foreground` and legal content text to `text-foreground/80`.

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit changes**

```bash
git add apps/web/app/about/page.tsx apps/web/app/contact/page.tsx apps/web/app/legal/page.tsx
git commit -m "style(web): update about, contact, legal pages to pure cream theme"
```

---

### Task 3: Remove Animated Aurora Text from Landing Page `final-cta.tsx`

**Files:**
- Modify: [apps/web/components/sections/final-cta.tsx](file:///Users/fankrits/dev/SomeScript-adv/apps/web/components/sections/final-cta.tsx)

- [ ] **Step 1: Replace `<AuroraText>` in `final-cta.tsx`**

Replace `<AuroraText>` wrapper with clean static heading text (`text-foreground`).

```tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="w-full max-w-7xl mx-auto px-6 py-20 relative z-10 border-t border-border/40">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-medium font-serif tracking-tight leading-tight text-foreground">
          Start Writing Perfect Research Today
        </h2>
        <p className="text-sm sm:text-base text-foreground/70 leading-relaxed font-light max-w-xl">
          Join researchers using SomeScript for flawless math, citations, and typesetting.
        </p>
        <div className="flex w-full justify-center">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 rounded-lg text-base shadow-lg shadow-primary/15 transition-all font-semibold cursor-pointer"
          >
            <Link href="/dashboard">
              Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/web/components/sections/final-cta.tsx
git commit -m "style(web): replace animated aurora text in final CTA with static heading"
```
