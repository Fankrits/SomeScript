# Task 2 Report: Responsive editor/PDF hero composition

## Outcome

Implemented the responsive `HeroMockup` composition in `apps/web/components/hero-mockup.tsx`.

- Added the optional `overlay?: React.ReactNode` prop and a centered overlay slot.
- Mobile uses normal document flow: overlay (when present), PDF card, then editor card.
- Desktop (`lg`) uses a fixed-height composition with the PDF card anchored top-right and the editor card anchored bottom-left.
- Preserved the existing typing/compilation animation state machine and the dynamically imported `FluidGlass` background.

## Changed files

- `apps/web/components/hero-mockup.tsx`
- `.superpowers/sdd/task-2-report.md`

The pre-existing `apps/web/components/hero-mockup.test.ts` was intentionally not modified or committed, per task ownership instructions.

## Test evidence

### RED baseline

Command:

```sh
cd apps/web && bun test components/hero-mockup.test.ts
```

Result before implementation: `0 pass`, `2 fail`.

- The desktop/mobile anchor assertion failed because the old layout used unprefixed absolute positioning.
- The overlay assertion failed because `HeroMockup` had no overlay prop or slot.

### GREEN verification

Command:

```sh
cd apps/web && bun test components/hero-mockup.test.ts
```

Result after implementation: `2 pass`, `0 fail`, `5 expect() calls`.

Additional checks:

```sh
cd apps/web && bun x tsc --noEmit --target ES2017 --lib dom,dom.iterable,esnext --allowJs --skipLibCheck --strict --esModuleInterop --module esnext --moduleResolution bundler --resolveJsonModule --isolatedModules --jsx react-jsx components/hero-mockup.tsx
git diff --check
```

Both commands exited successfully.

The repository-wide required command `cd apps/web && bun x tsc --noEmit` remains blocked by the pre-existing Task 1 test: `components/hero-mockup.test.ts(1,30): error TS2307: Cannot find module 'bun:test' or its corresponding type declarations.` The owned component type-checks successfully in isolation; no test or dependency files were changed to avoid exceeding this task’s ownership boundary.

## Self-review

- Confirmed exact responsive anchors, widths, stacking order, height values, and overlay z-index behavior are present.
- Confirmed mobile cards are `w-full` in normal flex flow and desktop positioning only begins at `lg`.
- Confirmed animation state and dynamic `FluidGlass` import were retained.
- Confirmed whitespace check passes and no unrelated files are included in the intended commit.
