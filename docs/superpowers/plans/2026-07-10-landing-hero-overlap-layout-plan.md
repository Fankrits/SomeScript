# Landing Hero Overlap Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the landing hero into a centered copy overlay framed by an editor preview at the lower left and a PDF preview at the upper right, while preserving readable text on the dark ShaderGradient background.

**Architecture:** `HeroMockup` becomes the responsive composition boundary. It receives an optional `overlay` node from `page.tsx`; on desktop the node is absolutely centered above the overlapping cards, while on mobile it remains first in normal flow and the cards stack below it. Existing animation state and card content remain inside `HeroMockup`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Bun test runner.

## Global Constraints

- Keep `FluidGlass` dynamically imported with `{ ssr: false }`.
- Keep the ShaderGradient background unchanged.
- Use light hero copy and a translucent dark copy panel for legibility against the animated background.
- At widths below `lg`, render copy, PDF, and editor in a normal vertical flow.
- Run targeted Bun test, targeted ESLint, `bun x tsc --noEmit`, and `bun run build` from `apps/web/`.

---

### Task 1: Lock the responsive composition contract with a source-level test

**Files:**
- Create: `apps/web/components/hero-mockup.test.ts`

**Interfaces:**
- Consumes: `apps/web/components/hero-mockup.tsx`
- Produces: a Bun regression test for the desktop anchors and mobile-flow classes.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./hero-mockup.tsx", import.meta.url), "utf8");

test("uses desktop anchors and mobile normal flow for the product previews", () => {
  expect(source).toContain('lg:absolute lg:top-0 lg:right-0');
  expect(source).toContain('lg:absolute lg:bottom-0 lg:left-0');
  expect(source).toContain('flex flex-col gap-6 lg:block');
});

test("renders an optional centered overlay above both previews", () => {
  expect(source).toContain('overlay?: React.ReactNode');
  expect(source).toContain('lg:absolute lg:inset-0 lg:z-30');
});
```

- [ ] **Step 2: Verify the test fails**

Run: `bun test components/hero-mockup.test.ts`

Expected: FAIL because `HeroMockup` currently has only absolute cards and does not accept an overlay.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/web/components/hero-mockup.test.ts
git commit -m "test(landing): define responsive hero overlap contract"
```

### Task 2: Build the responsive editor/PDF composition

**Files:**
- Modify: `apps/web/components/hero-mockup.tsx`

**Interfaces:**
- Consumes: `overlay?: React.ReactNode`
- Produces: `<HeroMockup overlay={...} />`, with normal-flow mobile cards and anchored desktop cards.

- [ ] **Step 1: Add the overlay prop**

```ts
type HeroMockupProps = {
  overlay?: React.ReactNode;
};

export default function HeroMockup({ overlay }: HeroMockupProps) {
```

- [ ] **Step 2: Replace the outer composition wrapper and add the overlay slot**

```tsx
<div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 lg:block lg:h-[780px] xl:h-[860px]" style={{ perspective: "1000px" }}>
  {overlay && (
    <div className="order-0 lg:absolute lg:inset-0 lg:z-30 lg:flex lg:items-center lg:justify-center">
      {overlay}
    </div>
  )}
  {/* PDF and editor cards follow. */}
</div>
```

- [ ] **Step 3: Move the PDF card into the top-right desktop anchor**

Replace its outer class list with:

```tsx
className={`order-1 w-full bg-white border border-[#e5dacd] rounded-xl shadow-2xl p-4 sm:p-6 transition-all duration-700 font-sans lg:absolute lg:top-0 lg:right-0 lg:z-10 lg:w-[54%] ${
```

- [ ] **Step 4: Move the editor card into the lower-left desktop anchor**

Replace its outer class list with:

```tsx
className="order-2 w-full bg-[#0e161b]/65 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-3 sm:p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-3xl lg:absolute lg:bottom-0 lg:left-0 lg:z-20 lg:w-[58%] font-mono text-[9px] sm:text-[11px] leading-relaxed overflow-hidden"
```

- [ ] **Step 5: Verify the test passes**

Run: `bun test components/hero-mockup.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 6: Commit the composition**

```bash
git add apps/web/components/hero-mockup.tsx apps/web/components/hero-mockup.test.ts
git commit -m "feat(landing): compose editor and PDF hero previews responsively"
```

### Task 3: Place readable centered copy inside the overlap

**Files:**
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `HeroMockup` with its `overlay` prop.
- Produces: a centered, readable copy panel rendered over the desktop preview composition and ahead of cards on mobile.

- [ ] **Step 1: Replace the standalone copy block and mockup wrapper**

```tsx
<div className="w-full max-w-6xl">
  <HeroMockup
    overlay={(
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-3xl border border-white/15 bg-slate-950/35 px-5 py-6 text-center shadow-2xl backdrop-blur-md sm:px-8 sm:py-8 lg:mx-0 lg:max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/20 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white">
          <Sparkles className="h-3.5 w-3.5" />
          Introducing AI Typesetting Engine v2.0
        </div>
        <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
          Research Deserves
          <span className="mt-1 block bg-gradient-to-r from-white via-[#dce8ff] to-[#8da0ce] bg-clip-text text-transparent">
            Perfection.
          </span>
        </h1>
        <p className="max-w-2xl text-base font-light leading-relaxed text-white/85 sm:text-lg">
          Transform rough notes and PDF drafts into publication-ready LaTeX. Powered by a Senior Researcher AI that understands the math, not just the text.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg" className="bg-primary px-8 py-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90">
            <Link href="/dashboard">Start Typesetting Free <ChevronRight className="ml-1.5 h-5 w-5" /></Link>
          </Button>
          <div className="flex items-center gap-1.5 px-2 text-xs font-light text-white/80">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            No credit card required
          </div>
        </div>
      </div>
    )}
  />
</div>
```

- [ ] **Step 2: Adjust hero section spacing**

Replace the main top padding and mockup margin with the wrapper above; retain `z-10`, use `py-10 sm:py-14 lg:py-20`, and leave the feature grid after the new `HeroMockup` wrapper with `mt-20 lg:mt-28`.

- [ ] **Step 3: Verify source and type checks**

Run:

```bash
bun test components/hero-mockup.test.ts
bun x eslint app/page.tsx components/hero-mockup.tsx components/hero-mockup.test.ts
bun x tsc --noEmit
```

Expected: each command exits with code 0.

- [ ] **Step 4: Commit the readable hero overlay**

```bash
git add apps/web/app/page.tsx apps/web/components/hero-mockup.tsx apps/web/components/hero-mockup.test.ts
git commit -m "style(landing): center readable copy inside hero previews"
```

### Task 4: Validate production layout at desktop and mobile sizes

**Files:**
- Test: `apps/web/components/hero-mockup.test.ts`

**Interfaces:**
- Consumes: completed responsive composition and page overlay.
- Produces: verified production output.

- [ ] **Step 1: Run the production build**

Run: `bun run build`

Expected: Next.js completes static generation with exit code 0.

- [ ] **Step 2: Capture a desktop screenshot**

Run the production app on an unused port and capture a 1440px-wide screenshot. Confirm the PDF is upper-right, editor lower-left, and the copy panel is centered between them.

- [ ] **Step 3: Capture a mobile screenshot**

Run the same production app at a 390px viewport. Confirm copy appears before the PDF and editor, and both previews are full-width, non-overlapping cards.

- [ ] **Step 4: Commit any visual-only class corrections**

```bash
git add apps/web/app/page.tsx apps/web/components/hero-mockup.tsx
git commit -m "fix(landing): tune responsive hero overlap spacing"
```
