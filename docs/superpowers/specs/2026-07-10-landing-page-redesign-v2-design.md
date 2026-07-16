# Spec: SomeScript Landing Page Redesign (Fluid Glass & Centered Layout)

* **Date:** 2026-07-10
* **Roles:** Senior UX/UI Designer & Senior Frontend Developer
* **Target Workspace:** `apps/web`

---

## 1. Objectives & User Experience Goals

Redesign the landing page hero section of SomeScript (`apps/web`) to create an immediate, premium impression on visiting researchers and writers. 

### Key Objectives
* **Centered Headline Layout:** Move the heading, subtext, and CTAs to the center top of the hero section for a clean, symmetrical, and focused layout.
* **Overlapping Diagonal Mockups:** Below the headline, position the Code Editor mockup at the **bottom-left** and the PDF Preview mockup at the **top-right** inside a relative layout container.
* **Animated WebGL Gradient Background:** Integrate `@shadergradient/react` to render a stunning, animated liquid gradient background behind the hero elements.
* **Fluid Glass macOS Windows:** Use the `@react-bits/FluidGlass-JS-CSS` component style to create highly realistic glassmorphism panels for the mockup frames, rendering interactive WebGL refraction.
* **High Performance (Core Web Vitals):** Optimize loading of WebGL assets in Next.js using dynamic imports (`ssr: false`) to avoid server-side compilation crashes.

---

## 2. Visual & Structural Design

### Grid & Page Flow
* **Hero Content (Centered):**
  * A badge, serif heading, body text, primary/secondary CTA buttons, and a subtext confirmation centered at the top.
* **Hero Visual Mockup (Diagonal Layout):**
  * A relative container of size `w-full max-w-4xl mx-auto h-[460px] md:h-[550px] mt-16`.
  * **Window 1 (Code Editor - Bottom-Left/Foreground):** Floating at the bottom-left, styled with a high-fidelity glassmorphism macOS window frame.
  * **Window 2 (PDF Preview - Top-Right/Background):** Floating at the top-right, styled as a crisp white paper sheet.

### Color Palette (Existing Integration)
* **Background:** Dynamic animated gradient transitioning between `#0f4c5c` (teal), `#e5dacd` (sand), and `#efe7dd` overlayed with a transparent cream mask.
* **Text:** `#1c2e36` (high contrast).

---

## 3. Component Architecture & Changes

### 3.1 `HeroBackground.tsx`
A client-only dynamic component that renders the `@shadergradient/react` WebGL plane gradient canvas. It is imported with `ssr: false` to ensure seamless Next.js App Router compilation.

### 3.2 `FluidGlass.jsx`
Modify the component at `apps/web/components/FluidGlass.jsx` to render standard Three.js geometries (e.g. `<dodecahedronGeometry />` and `<torusKnotGeometry />`) instead of trying to load missing `.glb` models from external paths. This guarantees error-free rendering and zero network assets dependencies.

### 3.3 `HeroMockup.tsx`
Update the mockup styling to:
- Use glassmorphism classes (`backdrop-blur-xl bg-white/20 border border-white/30 shadow-2xl`) for the Code Editor window frame to give it a stunning fluid glass appearance.
- Arrange the Editor (bottom-left) and the PDF Preview (top-right) in a diagonal overlapping design.
