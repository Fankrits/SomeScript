# Task 2 Report: Create the `main-file` Eve tool and document it

## Status
DONE. Two commits: feature (696108a) + fix (77a13f6).

## Implementation Summary

### Files Created
1. **`apps/editor/agent/tools/main-file.ts`** (68 lines)
   - Implements the Eve tool for checking/changing a project's root .tex file
   - Follows the established pattern of sibling tools (resolve project, call lib function, format output)
   - Uses `readProjectSettings()` to report current value
   - Uses `setMainFile()` to validate and persist changes
   - Includes proper error handling and type-safe output formatting via `toModelOutput()`

### Files Modified
1. **`apps/editor/agent/instructions.md`**
   - Inserted new `### main-file` section between `### move-file` and `### cite-search`
   - Documented usage (checking current value, changing to a new value)
   - Clarified that path validation happens (must be .tex, must exist)
   - Explained that Settings panel updates automatically

## Implementation Notes

**Deviation 1 — resolveToolProject signature:** The brief's code showed:
```ts
const pid = await resolveToolProject(projectId, workspaceFrom(ctx));
```

However, `resolveToolProject()` only accepts one argument (projectId). All existing tools call it with a single argument. The authz.ts file has a comment suggesting workspace ID will be added once Eve exposes it to tool execution.

**Action taken:** Simplified to match the current signature and existing pattern:
```ts
const pid = await resolveToolProject(projectId);
```

**Deviation 2 — workspace.ts file:** Initially created `apps/editor/agent/lib/workspace.ts` as the brief's code imported `workspaceFrom`, but after fixing the `resolveToolProject` call, the function was no longer used. The file existed in a git stash (an unrelated refactor) and would cause a merge conflict when the stash is popped. 

**Action taken (fix commit 77a13f6):** Removed the unused workspace.ts file and the empty directory. This prevents conflicts with the stashed version while keeping main-file.ts working correctly.

## Verification

### Type-check Results
```bash
cd apps/editor && bun x tsc --noEmit
```
✓ **PASS** — No errors or warnings

### Code Review Checklist
- ✓ Tool file follows the exact structure of sibling tools (defineTool, inputSchema, execute, toModelOutput)
- ✓ Tool is auto-discovered by filename (main-file.ts → tool name "main-file")
- ✓ Imports are correct and types are sound
- ✓ Instructions.md documentation is inserted at the exact location (between move-file and cite-search)
- ✓ Documentation format matches existing sections
- ✓ No unused imports or dead code
- ✓ Commit messages accurate and clear

## Commit Details

**Commit 1 (Feature):**
- **SHA:** 696108a
- **Message:** `feat(eve): add main-file tool to check/change the project's root .tex file`
- **Files:** 3 files changed, 93 insertions(+)
- **Contents:** main-file.ts tool, instructions.md documentation, workspace.ts (later removed)

**Commit 2 (Fix):**
- **SHA:** 77a13f6
- **Message:** `fix(eve): remove unused workspace.ts duplicate from main-file task`
- **Files:** 1 file changed, 18 deletions(-)
- **Contents:** Removed unused workspace.ts to prevent merge conflicts with stashed refactor

## Self-Review Findings

Initial review found and corrected one issue:
1. workspace.ts file was created but not actually used by main-file.ts (dead code)
2. Removed in fix commit 77a13f6 to prevent merge conflicts with stashed refactor

Final implementation:
1. Fully satisfies the task requirements
2. Type-checks successfully (verified after fix)
3. Follows existing code patterns consistently
4. Includes proper error handling and user-facing messages
5. Has correct documentation inserted at the right location
6. No dead code or unused imports
