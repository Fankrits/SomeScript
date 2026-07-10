# Spec: SomeScript Landing Page Redesign

* **Date:** 2026-07-10
* **Roles:** Senior UX/UI Designer & Senior Frontend Developer
* **Target Workspace:** `apps/web`

---

## 1. Objectives & User Experience Goals

Redesign the landing page hero section of SomeScript (`apps/web`) to create an immediate, premium impression on visiting researchers and writers. 

### Key Objectives
* **Demonstrate the Core Workflow:** Replace the static file-upload card with an interactive, side-by-side visualization of a LaTeX editor and its compiled PDF preview.
* **Premium Editorial Aesthetic:** Adopt a high-contrast serif typeface for headings and a clean, spacious structure that matches the visual language of top-tier academic and scientific publishing.
* **Responsive Visual Depth:** Use layered floating windows (Option B) that render with 3D depth on desktop screens and stack neatly on mobile screens.
* **High Performance (Core Web Vitals):** Implement the animations purely using React hooks and lightweight CSS transitions without pulling in large external animation or parsing libraries.

---

## 2. Visual & Structural Design

### Grid & Page Flow
* The landing page hero section will be split into a responsive two-column grid (`lg:grid-cols-2`).
* **Left Column:** A badge, serif heading, body text, primary/secondary CTA buttons, and a subtext confirmation.
* **Right Column:** A container using `perspective-1000` to house two overlapping cards:
  1. **Window 1 (Code Editor - Bottom-Left/Foreground):** Floating in front, styled as a macOS editor pane.
  2. **Window 2 (PDF Preview - Top-Right/Background):** Floating behind the editor pane, styled as a printed PDF paper page.

### Color Palette (Existing Integration)
* **Background:** `#FBF6F0` (Cream)
* **Text / Primary:** `#0f4c5c` (Teal)
* **Secondary / Accent:** `#efe7dd` and `#e5dacd` (Sand / Warm Grey)

---

## 3. Typography Redesign

Import `Playfair_Display` from `next/font/google` in `layout.tsx` to serve as the editorial headings font.

```typescript
// apps/web/app/layout.tsx
import { Playfair_Display, Inter } from "next/font/google";

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
});
```

We will configure this in `globals.css` or use the tailwind class `font-serif` to target the main heading:
* Class: `font-serif tracking-tight text-foreground font-medium`

---

## 4. Component Architecture: `HeroMockup.tsx`

We will create a new component `apps/web/components/hero-mockup.tsx` containing the markup, layout, and animation logic.

### 4.1 Window 1: Code Editor
* **Window Headers:** Title bar with Red, Yellow, Green macOS buttons. Tabs showing `main.tex` (active) and `references.bib` (inactive).
* **Line Numbers:** Left sidebar with lines 1-10.
* **Body Content:**
  * Fixed, stylized code lines represented by abstract color-pill shapes.
  * A section containing readable LaTeX code that is dynamically typed character-by-character.
* **Status Bar:** Bottom bar showing `LaTeX`, `UTF-8`, cursor line position, and a compilation status badge:
  * Statuses: `Idle`, `Typing`, `Compiling...` (with spinner), `Success (No Errors)`.

### 4.2 Window 2: PDF Preview
* **Page Style:** Elevated white card resembling an A4/Letter paper sheet.
* **Content:**
  * Header layout matching an academic LaTeX paper (centered title, author block, double-column content lines).
  * An equation rendering section. When the compilation finishes, the typeset math formula fades/pulses into view.

---

## 5. Animation Logic

The animation will operate on a repeating state loop using standard React state hooks (`useState` and `useEffect`):

### The 4 State Phases
1. **Phase 1: Typing (Duration: ~3.5s)**
   * Code editor types out characters for a mathematical environment:
     `\int_{a}^{b} f(x) \, dx = F(b) - F(a)`
   * Cursor flashes at the end of the text.
2. **Phase 2: Compilation (Duration: 1.2s)**
   * Typing pauses.
   * Status bar updates to `Compiling...`.
   * A spinner icon appears next to the status.
3. **Phase 3: Render Success (Duration: 5.0s)**
   * Editor status changes to `Success (No Errors)`.
   * PDF Preview window receives a temporary light green border flash.
   * The formatted mathematical equation displays prominently in the math section of the PDF sheet.
4. **Phase 4: Reset & Loop**
   * Clear the text, hide the typeset math, and restart Phase 1.

---

## 6. Implementation Steps

1. **Font Setup:** Add `Playfair_Display` Google Font inside `apps/web/app/layout.tsx`.
2. **Component Creation:** Write the `HeroMockup` component in `apps/web/components/hero-mockup.tsx` with tailwind styles and the animation loop.
3. **Integrate Component:** Update `apps/web/app/page.tsx` to include `HeroMockup` and update heading typography.
4. **Build & Test Verification:** Verify TypeScript compile and Bun build output of `apps/web`.
