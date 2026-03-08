Now I have a clear picture of the current review prompt. Let me generate the PRD.

# PRD: Update Review Prompt with Code Quality Criteria

## Overview
Replace the current review checklist in `getReviewInstructions()` (`src/prompt.ts:186-195`) with a focused set of code quality and elegance criteria, adding questions about elegant writing, cleanliness, structure, readability, efficiency, codebase convention alignment, and optimal implementation approach.

## Goals
- Improve review phase output quality by directing the agent to evaluate code elegance and alignment with codebase conventions.
- Replace generic checklist items with opinionated, actionable quality questions.

## Non-Goals
- Changes to the finalize, implement, or any other phase prompt.
- Changes to how review feedback is parsed, stored, or passed to finalize.
- Adding new CLI flags or config options.
- Changing review output format.

## Requirements

### Functional Requirements
- **REQ-F-001**: Replace the `# REVIEW CHECKLIST` section in `getReviewInstructions()` with the following questions:
  1. Is the code elegantly written?
  2. Is the code clean?
  3. Is the code well-structured?
  4. Is the code easy to understand?
  5. Is the code efficient?
  6. Are we following best practices and conventions for the rest of the codebase?
  7. Is the implementation the most efficient way to solve the problem?
- **REQ-F-002**: Retain all other sections of `getReviewInstructions()` unchanged: `# STARTED TASK CHECK`, `# REVIEW OBJECTIVE`, `# GIT DIFF`, `# OUTPUT`.

### Non-Functional Requirements
- **REQ-NF-001**: Existing tests for the review prompt in `src/prompt.test.ts` must pass after the change.
- **REQ-NF-002**: No new dependencies introduced.

## Technical Considerations
- Single function change: `getReviewInstructions()` in `src/prompt.ts:174-211`.
- The new checklist replaces lines 186-195 only; surrounding structure is preserved.
- Existing tests likely assert on checklist content—update or add assertions for the new questions.

## Acceptance Criteria
- [ ] `getReviewInstructions()` contains all 7 new code quality questions.
- [ ] Old checklist items (Correctness, Tests, Security, Performance, etc.) are removed.
- [ ] All sections outside the checklist (`# STARTED TASK CHECK`, `# REVIEW OBJECTIVE`, `# GIT DIFF`, `# OUTPUT`) are unchanged.
- [ ] `bun test` passes with no regressions.
- [ ] `bun run tsc --noEmit` passes.

## Out of Scope
- Prompt changes for implement or finalize phases.
- Config-driven prompt customization.
- Review output format changes.

## Open Questions
- Should the old checklist items (correctness, tests, security, edge cases) be retained alongside the new questions, or fully replaced? - They should be merged.
