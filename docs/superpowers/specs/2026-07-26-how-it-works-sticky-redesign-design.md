# Design Spec: How It Works Sticky Scroll Redesign

- **Date**: 2026-07-26
- **Status**: Approved / Ready for Implementation Planning
- **Target Component**: `apps/web/components/sections/how-it-works.tsx`
- **Related UI Primitives**: `apps/web/components/kokonutui/liquid-glass-card.tsx`, `motion/react`

---

## 1. Overview & Goal

Redesign the **How It Works** section on the landing page from a standard vertical scroll timeline into an immersive **sticky scroll-driven interactive showcase** (Split-Screen Sticky Showcase).

As users scroll down the landing page:
1. The section viewport pins (`sticky top-0 h-screen`) for a multi-viewport scroll track (`h-[350vh]`).
2. Scroll progress (`scrollYProgress`) maps seamlessly to four distinct steps (01. Write & Prompt, 02. AI Co-Authoring, 03. Instant Compile, 04. Export & Share).
3. The left column highlights the active step title, description, and visual progress track.
4. The right column displays a dynamic, sticky sandbox card that smoothly animates custom UI representations corresponding to each step.

---

## 2. Component Architecture & File Structure

### Modified Files:
- `apps/web/components/sections/how-it-works.tsx`: Replaced standard Timeline with sticky scroll split-screen architecture.

### Supporting Components / Subcomponents (Internal to `how-it-works.tsx` or helper components):
1. **`StickyScrollContainer`**: Manages outer height (`350vh`), sticky viewport (`sticky top-0 h-screen`), scroll calculation via `motion/react`.
2. **`StepList`**: Left-side column rendering the step items, index numbers, active highlighting, progress fill bar, and click-to-scroll navigation handlers.
3. **`InteractiveSandboxStage`**: Right-side interactive canvas container displaying animated cards for each active step.
4. **Step-Specific Animation Canvas Components**:
   - `Step1WritePromptCanvas`: Animated typing of LaTeX matrix equation in code editor snippet view.
   - `Step2EveAiCanvas`: Ambient sparkling glow with Eve AI message bubble, TikZ generator chip, and BibTeX sync status.
   - `Step3TectonicCompileCanvas`: Real-time compilation progress bar (0.00s -> 0.12s) with live document preview rendering.
   - `Step4ExportShareCanvas`: Interactive download PDF CTA badge with arXiv submission indicator and co-author share card.

---

## 3. Scroll & Motion Logic (`motion/react`)

### Scroll Progress Mapping
- Outer container ref: `containerRef` (`h-[350vh]`).
- Hook: `const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] })`.
- Step Thresholds:
  - **Step 0 (01. Write & Prompt)**: `0.00 <= scrollYProgress < 0.25`
  - **Step 1 (02. AI Co-Authoring)**: `0.25 <= scrollYProgress < 0.50`
  - **Step 2 (03. Instant Compile)**: `0.50 <= scrollYProgress < 0.75`
  - **Step 3 (04. Export & Share)**: `0.75 <= scrollYProgress <= 1.00`

### Step Change Detection & Motion Values
- Use `useMotionValueEvent(scrollYProgress, "change", (latest) => ...)` to set `activeStep` state (0, 1, 2, 3).
- Smooth progress indicator tracking per step using `useTransform(scrollYProgress, [0, 1], ["0%", "100%"])`.
- Reduced Motion support (`useReducedMotion()`): Fall back to static views or instant step jumps if user prefers reduced motion.

---

## 4. Step-by-Step Stage Visual & Animation Breakdown

### Step 1: 01. Write & Prompt
- **Left Text**: Focus on standard LaTeX input and natural language prompts.
- **Right Stage Canvas**:
  - Code editor mockup (`input_prompt.tex`).
  - Animated code typing effect for `\begin{equation} R = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix} \end{equation}`.
  - Cursor blinking animation (`animate-pulse`).

### Step 2: 02. AI Co-Authoring
- **Left Text**: Eve AI processing requests and generating complex math, TikZ diagrams, and bibliographies.
- **Right Stage Canvas**:
  - Eve AI assistant interface with sparkling icon badge (`<Sparkles />`).
  - Chat card sliding up (`initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}`).
  - Dynamic status pills glowing green and blue for "TikZ Code Generated" and "bibtex keys synced".

### Step 3: 03. Instant Compile
- **Left Text**: Background Tectonic compilation engine updating page-accurate previews in real-time.
- **Right Stage Canvas**:
  - Dual card view: Compiler Status Card + Mini PDF Document Preview Card.
  - Animated progress indicator showing compilation time (`0.12s`) and green check status.
  - PDF document skeleton lines loading and revealing formatted matrix equation layout.

### Step 4: 04. Export & Share
- **Left Text**: Download typeset PDF or share isolated workspace sandboxes with collaborators.
- **Right Stage Canvas**:
  - Split action cards: "Download PDF (arXiv ready)" and "Invite Collaborators".
  - Hover micro-interactions, animated success checkmarks, and git worktree status indicators.

---

## 5. Responsive Design & Accessibility

### Mobile / Tablet Strategy (`< lg`)
- On small screens (`< 1024px`), `350vh` sticky scrolling can feel restrictive on touch screens.
- **Fallback**: Stack steps vertically with subtle scroll fade-ins, or render a tabbed step switcher allowing users to tap steps directly while keeping the canvas visible.

### Accessibility (a11y)
- ARIA roles: `role="region" aria-label="How It Works"`.
- Keyboard navigation: Clicking step items scrolls smooth-scroll targets.
- Reduced Motion: Respect `prefers-reduced-motion` using Motion's `useReducedMotion()`.

---

## 6. Verification & Quality Criteria

- **TypeScript Safety**: `bun x tsc --noEmit` must pass cleanly without errors.
- **Performance**: Zero scroll lag; transform properties used for hardware-accelerated animations (`transform`, `opacity`).
- **Aesthetics**: Glassmorphism aesthetic matching `LiquidGlassCard`, sleek typography (Inter / Serif headings), consistent color palette (`#0f4c5c`, `#dd7e21`, dark/light theme support).
