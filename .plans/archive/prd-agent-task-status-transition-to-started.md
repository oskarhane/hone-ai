Now I have enough context. Let me generate the PRD.

# PRD: Agent Task Status Transition to 'started'

## Overview

When the implement phase agent picks up a task from the task file, it should immediately update that task's `status` field from `pending` to `started` (or `in_progress`). Currently the reviewer agent has no reliable way to know which task was just implemented, since the only signal is an optional `TASK_COMPLETED` marker extracted from stdout after the fact.

## Goals

- Give the reviewer (and any observer) a clear, file-based signal about which task is actively being worked on.
- Leverage the existing task file YAML as the source of truth for task state — consistent with how `completed` and `completed_at` are already written by the finalize phase.
- Require no new tooling; accomplish this purely via prompt instructions to the implement-phase agent.

## Non-Goals

- hone-ai itself will NOT write the `started` status directly (no new local file-write code).
- No new CLI flags or commands.
- No changes to the `review` or `finalize` phase prompts (the reviewer can use `git diff` and the task file to find the `in_progress` task).
- No rollback / reset of `started` status if the implement phase fails.

## Requirements
### Functional Requirements

- **REQ-F-001**: The implement-phase prompt MUST instruct the agent to update the picked task's `status` from `pending` to `in_progress` in the task YAML file immediately after selecting it, before beginning exploration or implementation.
- **REQ-F-002**: The instruction must specify the exact YAML field path (`status`) and value (`in_progress`) to write, consistent with the existing `Task` interface (`'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'`).
- **REQ-F-003**: The status update must be written to the task file on disk (not just in the agent's context) so that the reviewer agent can read it.
- **REQ-F-004**: The status update MUST happen before the `TASK_COMPLETED` output marker and before any feedback loops.
- **REQ-F-005**: If no `pending` task is found (all done), the agent outputs `<promise>COMPLETE</promise>` as before — no status update needed.

- REQ-F-001: The review phase prompt must instruct the agent to check whether a task with status `started` exists before beginning review.
- REQ-F-002: If a `started` task is found, the review agent must treat it as a hint and prioritize reviewing that specific task.
- REQ-F-003: If no `started` task exists, the review agent must proceed with its default review behavior without error.

### Non-Functional Requirements

- **REQ-NF-001**: The change is prompt-only; no TypeScript source changes outside `src/prompt.ts`.
- **REQ-NF-002**: Existing tests for `prompt.ts` must continue to pass; a new test asserting `in_progress` appears in the implement prompt snapshot is added.
- **REQ-NF-003**: The instruction must be unambiguous and placed early in the implement phase section so agents don't skip it.
## Technical Considerations

- The `Task.status` type in `src/prds.ts:11` already includes `'in_progress'`, so no type changes are needed.
- The `findNextTask()` function in `src/status.ts:39` only looks for `status === 'pending'`; once a task is set to `in_progress`, it won't be picked again by a subsequent iteration — which is the correct behaviour.
- The reviewer's `getReviewInstructions()` in `src/prompt.ts:172` already optionally receives `taskId` but falls back to "the changes just made". With `in_progress` written to the task file, the reviewer can do `grep in_progress` on the task file for a reliable fallback — but no prompt change is required for this PRD.
- The implement-phase instruction lives in `getImplementInstructions()` at `src/prompt.ts:104`. The new step should be inserted in the **TASK SELECTION** section, right after the agent selects a task.
- No atomic write wrapper is needed; the agent's native file-writing tools handle this.

## Acceptance Criteria

- [ ] `getImplementInstructions()` contains explicit text instructing the agent to set `status: in_progress` on the selected task in the task YAML file before proceeding.
- [ ] The instruction specifies the file to edit (the task file referenced in CONTEXT FILES) and the exact YAML field/value.
- [ ] `src/prompt.test.ts` includes an assertion that the implement prompt contains the string `in_progress`.
- [ ] `bun test` passes.
- [ ] `bun run tsc --noEmit` passes.
- [ ] A manual smoke-test run of `hone run` shows the picked task transitioning to `in_progress` in the YAML file before `TASK_COMPLETED` is emitted.

## Out of Scope

- Resetting `in_progress` back to `pending` on agent failure (could be a follow-up).
- A `started` status value distinct from `in_progress` (reuse existing enum value).
- Any UI or API surface changes.
- Changing the review or finalize phase prompts.

## Open Questions

- Should `in_progress` tasks be skippable / retried on the next `hone run` invocation if the previous run died mid-task? (`findNextTask` currently ignores them — they'd be stuck.)
- Should `started_at` timestamp be written alongside the status, mirroring `completed_at`?