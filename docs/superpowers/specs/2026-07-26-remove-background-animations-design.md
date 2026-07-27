# Design Spec: Remove Background Animations & Unify Pure White Cream Background

**Date**: 2026-07-26  
**Target Workspace**: `apps/web`

---

## 1. Goal
Remove all remaining animated dynamic background components (WebGL ShaderGradient canvas and Aurora text keyframes) from `apps/web` and replace them with the consistent pure white cream background (`#FBF6F0` / `bg-background`), matching the landing page.

---

## 2. Changes Summary

### A. Remove WebGL 3D Shader Gradient Animation (`hero-background.tsx`)
- Simplify `apps/web/components/hero-background.tsx` to render a clean, static, performance-friendly background overlay on `bg-background` (`#FBF6F0`) with subtle radial gradients or grid styling.
- Remove dynamic imports of `@shadergradient/react`.

### B. Refactor Subpages (`about`, `contact`, `legal`)
- **`apps/web/app/about/page.tsx`**
- **`apps/web/app/contact/page.tsx`**
- **`apps/web/app/legal/page.tsx`**
  - Switch Header to `<Header dark={false} />`.
  - Replace dark glass cards (`bg-[#0e161b]/40 backdrop-blur-md text-white`) with clean light cards (`bg-card border-border text-foreground shadow-sm`).
  - Update headings from `text-white` to `text-foreground` and subtext to `text-muted-foreground`.

### C. Remove Animated Text Gradient (`final-cta.tsx`)
- In `apps/web/components/sections/final-cta.tsx`, replace `<AuroraText>` gradient animation with clean static heading styling (`text-foreground`).

### D. Header Component (`header.tsx`)
- Change default prop from `dark = true` to `dark = false` in `apps/web/components/header.tsx` for consistent dark text on cream background across all pages.

---

## 3. Verification Plan
- Build type check: `bun x tsc --noEmit` inside `apps/web/`.
- Verify page renders without animation artifacts or missing styles.
