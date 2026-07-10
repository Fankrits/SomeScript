# Task 1 Report: Responsive Hero Overlap Contract

## Status

Task 1 is complete as a contract-first test task. The regression test was written from the brief, verified RED against the current `HeroMockup` source, and committed. The implementation-side GREEN state is intentionally deferred to the next task because this task owns only the test and report.

## TDD evidence

### RED

Command:

```text
cd /Users/fankrits/dev/SomeScript-adv/apps/web
bun test components/hero-mockup.test.ts
```

Result: expected failure.

- Bun ran 2 tests.
- 0 passed and 2 failed.
- The first failure showed that `hero-mockup.tsx` does not yet contain `lg:absolute lg:top-0 lg:right-0`.
- The second failure showed that the source does not yet contain `overlay?: React.ReactNode`.
- The failure was a normal assertion failure, confirming the test is exercising the missing responsive-layout contract rather than failing to load or parse.

### GREEN

Not performed in this task. The requested implementation changes belong to the subsequent `HeroMockup` implementation task. Running the test after that implementation should provide the GREEN evidence for this contract.

## Contract covered

The new source-level Bun test locks these requirements:

- Desktop PDF preview anchor: `lg:absolute lg:top-0 lg:right-0`.
- Desktop editor preview anchor: `lg:absolute lg:bottom-0 lg:left-0`.
- Mobile normal-flow composition: `flex flex-col gap-6 lg:block`.
- Optional overlay prop: `overlay?: React.ReactNode`.
- Desktop centered overlay layer above both previews: `lg:absolute lg:inset-0 lg:z-30`.

## Changed files

- Created `apps/web/components/hero-mockup.test.ts`.
- Created `.superpowers/sdd/task-1-report.md`.

Existing edits in the worktree were preserved. No production implementation file was changed by this task.

## Commits

- `1c4ddcb test(landing): define responsive hero overlap contract` — failing contract test, committed as required by the brief.
- The report is intentionally separate and is the only remaining task file to commit.

## Self-review

- The test content matches the exact snippets specified in the task brief.
- The test reads the colocated implementation with `new URL("./hero-mockup.tsx", import.meta.url)`, so it does not depend on the current working directory.
- The test remains intentionally source-level and does not import or render the client component, avoiding unrelated browser/runtime setup.
- The current RED result is attributable to the missing implementation contract, with both expected assertions reported.
- No unrelated worktree changes were staged or reverted.

## Concerns / follow-up

- The test will remain failing until the next task updates `HeroMockup` to implement the required desktop anchors, mobile flow classes, and optional overlay layer.
- The source-level assertions intentionally require the exact class/property strings from the brief; future refactors that preserve behavior but alter these strings will need an explicit contract decision.
