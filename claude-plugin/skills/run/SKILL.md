---
description: Executes the hone implement/review/finalize loop. Claude directly implements tasks from a task file, reviews changes, and commits. Each iteration runs in a forked agent context.
---

Execute the hone task implementation loop.

## VCS detection (run once at start)

Determine two facts and reuse them for the whole loop:

1. **VCS in use.** Default to `git`. If you detect a different VCS in the repo root (e.g. a `.jj/`, `.hg/`, `.sl/` directory, or another clear signal), use that VCS instead. For any non-git VCS, substitute the equivalent stage / commit / log / check-ignore commands — do not run `git` commands.
2. **`PLANS_IGNORED`.** Run the VCS's ignore-check against `.plans/` (for git: `git check-ignore -q .plans/`; for others, the equivalent). Set `PLANS_IGNORED=true` if ignored, otherwise `false`.

These two facts gate every commit step below.

## Pre-step

If you're on the VCS main/master/trunk branch or a feature branch that's unrelated to this feature, ask the user if they want you to create a new branch (suggest a good name) for this feature.

Check if the PRD file (`.plans/prd-<feature>.md`) and tasks file (`<tasks-file>`) have uncommitted changes or are untracked. Commit them before starting any iteration:

- If `PLANS_IGNORED=true`: skip this commit entirely — the planning files are intentionally untracked.
- Otherwise, using the detected VCS, stage `.plans/prd-<feature>.md` and `<tasks-file>` and commit with message `<feature>: add PRD and tasks`. For git this is `git add … && git commit -m …`; for other VCSes, use the equivalent.

Skip this if both files are already tracked and committed with no changes.

## Step 1: Parse arguments

`$ARGUMENTS` is free-form text like: `.plans/tasks-feature.yml -i 5 --skip review`

Extract these values (be flexible with format — users may use `-i 5`, `-i=5`, `--iterations 5`, etc.):

- `tasks-file`: the `.plans/tasks-*.yml` path (usually the first argument)
- `N`: number of iterations (from `-i`, `--iterations`, or similar)
- `skip_review`: whether any form of skip was requested (`--skip`, `--skip review`, `--skip=review`, `skip review`, etc.)

Validate the tasks file exists. Extract feature name from filename: `tasks-<feature>.yml` -> `<feature>`.

## Step 1.5: Capture caller VCS/worktree context

Before launching the first forked Agent, record the caller's repo root, worktree path, current branch/bookmark/checkout target, and current HEAD revision. This caller worktree is the source of truth for `/hone:run`.

If using git and the current directory is a linked worktree, treat that starting worktree as the only place that counts as "done". Child Agents may use isolated worktrees or branches, but their finalized commit MUST be merged or cherry-picked back into the starting worktree before the iteration counts as complete.

For git, prefer `git merge --ff-only <child-commit>` when possible. If fast-forward is not possible, use `git cherry-pick <child-commit>`.

After merge-back, verify from the starting worktree that the child commit or equivalent diff is present before launching the next iteration.

## Step 2: Run iterations

For each iteration from 1 to N, launch a **forked Agent** (using the Agent tool) with the full prompt below. Each iteration gets a fresh context to prevent bloat.

Pass the caller repo/worktree context into every forked Agent prompt:

- Caller repo root: `<caller-repo-root>`
- Caller worktree: `<caller-worktree>`
- Caller branch/bookmark: `<caller-branch>`
- Caller HEAD at launch: `<caller-head>`

Do NOT treat the child Agent's own worktree or branch as the final destination. The parent `/hone:run` agent is responsible for bringing the finalized child commit back into the caller worktree before marking the iteration complete.

After each child Agent returns:

1. Parse `TASK_COMPLETED`, `FINALIZED`, and `FINALIZED_CHANGESET` from its output.
2. If the child finalized in a different git worktree or branch, immediately apply that commit back onto the starting worktree. Prefer `git merge --ff-only <child-commit>`; otherwise `git cherry-pick <child-commit>`.
3. Verify from the starting worktree that the integrated commit is now present.
4. Only then count the iteration as complete and continue.

**Parallelize when safe.** Before launching, scan the task list for pending tasks that are mutually independent — no shared dependencies, no overlapping files or modules, no conflicting commits. When you find a group of independent tasks, launch their iteration Agents **in parallel** (multiple Agent tool calls in a single message), one Agent per task, with each Agent's prompt naming the specific task it owns so they don't pick the same one. Fall back to sequential launching whenever tasks touch overlapping code, share dependencies, or you can't confidently rule out conflicts — correctness over speed.

If the Agent output contains `<promise>COMPLETE</promise>`, all tasks are done — stop iterating early.

After all iterations complete, report:

```
Completed <actual> iterations (of <N> requested)
Next: /hone:review for a strict end-of-feature audit of the branch.
```

## Full Agent Prompt for Each Iteration

The Agent prompt MUST include the tasks file path, feature name, whether to skip review, and the full instructions below. Construct it as follows:

---

````
# HONE: ITERATION <i> of <N>

Feature: <feature>
Tasks file: <tasks-file>
Skip review: <yes/no>
Caller repo root: <caller-repo-root>
Caller worktree: <caller-worktree>
Caller branch/bookmark: <caller-branch>
Caller HEAD at launch: <caller-head>

# PHASE 1: IMPLEMENT

## CONTEXT FILES — READ ALL OF THESE FIRST

Read the following files before doing anything else:
- <tasks-file> (the task YAML file — this is your source of truth for tasks)
- .plans/progress-<feature>.txt (development log — read if it exists)
- AGENTS.md (CRITICAL: contains feedback commands for this project — test, build, lint, format)

## TASK SELECTION

CRITICAL: You MUST only choose tasks from the task file referenced above.
Do NOT select tasks from any other task file, even if you can access them.

Pick the next single task that's not completed yet. Prioritize from this list (where 1 is highest priority):

1. Dependencies
2. Architectural decisions and core abstractions
3. Integration points between modules
4. Unknown unknowns and spike work
5. Standard features
6. Polish and quick wins

If there are no tasks left with `status: pending`, output `<promise>COMPLETE</promise>` and stop immediately.

Immediately after selecting a task, update the task's `status` field from `pending` to `in_progress` in the task YAML file. Do this before any exploration or implementation.

## EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

## EXECUTION

Complete the single task.

If you find that the task is larger than you expected (for instance, requires a refactor first), output "HANG ON A SECOND".

Then, find a way to break it into a smaller chunk and only do that chunk (i.e. complete the smaller refactor).

IMPORTANT: Do NOT run tests or feedback loops during exploration or incremental development.
Only run feedback loops AFTER you have fully completed implementing the task.

## CODE COMMENT POLICY

Default to writing NO comments. Well-named identifiers already explain what code does.

Only write a comment when it captures a real gotcha or exception that a future reader could not infer from the code itself:
- a hidden constraint or invariant
- a workaround for a specific bug or upstream quirk
- behavior that would genuinely surprise a careful reader

Do NOT write comments that:
- restate what the code does ("// loop over users")
- reference the current task, PR, or caller ("// added for task-003", "// used by X")
- explain obvious type/parameter intent already conveyed by names
- narrate intermediate steps

If removing the comment would not confuse a future reader, do not write it. When in doubt, leave it out.

## FEEDBACK LOOPS

Run feedback loops ONLY when the task implementation is complete.

IMPORTANT: Get the feedback commands from AGENTS.md — they are project-specific.
Look for the "Feedback Instructions" section which lists TEST COMMANDS, BUILD COMMANDS, LINT COMMANDS, and FORMAT COMMANDS. Run these commands.

If CLI or script, run them and verify output.

If tests fail or there are errors you cannot fix, DO NOT output TASK_COMPLETED.
Instead, revert the task status back to `pending` in the YAML file and stop. The task will be retried on the next iteration.

## IMPORTANT: DO NOT COMMIT YET

DO NOT create a git commit during this phase. All commits happen in the finalize phase.
Your changes should remain uncommitted at this point.

## IMPLEMENT OUTPUT

At the end of the implement phase, output on a single line:
TASK_COMPLETED: <task-id>
But do not mark the task as completed in the tasks file yet!

This marker tracks which task you completed.
Only output this marker if the task is fully complete and all feedback loops pass.

YOU CAN ONLY PICK A SINGLE TASK TO WORK ON!

---

# PHASE 2: REVIEW

<If skip_review is true, include: "REVIEW PHASE SKIPPED as requested." and move to Phase 3.>

<If skip_review is false, include:>

Launch the `hone:hone-reviewer` subagent to review the changes. Pass it:

- The task file path so it can check for in_progress tasks
- Tell it to review the git diff

Wait for the review feedback, then carry it into Phase 3's REVIEW FEEDBACK section.

---

# PHASE 3: FINALIZE

## CONTEXT FILES — RE-READ THESE

Read the following files again (they may have changed during implementation):
- <tasks-file>
- .plans/progress-<feature>.txt (if exists)
- AGENTS.md (for feedback commands and conventions)

## REVIEW FEEDBACK

<Insert the review feedback here, or "No review feedback provided (review was skipped or approved).">

## ACTIONS TO COMPLETE

1. **Apply Feedback** (if any)
   - Address all critical and high priority feedback from the review
   - Only run feedback loops if you made changes to address feedback

2. **Run Final Feedback Loops** (if needed)
   - If you applied feedback or made any changes, get the feedback commands from AGENTS.md and run them
   - Look for the "Feedback Instructions" section in AGENTS.md

3. **Update Task File**
   - Mark the completed task with `status: completed`
   - Set `completed_at: <ISO-8601-datetime>`
   - DO NOT mark as completed if feedback wasn't fully addressed

4. **Update Progress File**
   - Append to .plans/progress-<feature>.txt with this format:
     ```
     ## TASK-XXX — <ISO-8601-datetime>
     <1–2 sentence summary>
     Files: +new.ts, ~mod.ts, -del.ts
     Decisions: <only if non-obvious; one short bullet or inline; omit line if none>
     ```
   - Files line uses status markers: `+` new, `~` modified, `-` deleted; for renames use `>old=>new`. Comma-separated paths only — no per-file prose.
   - Be dense. No filler. Skip the Decisions line entirely if nothing non-obvious.

5. **Update AGENTS.md (rare)**
   - Default: do NOT edit AGENTS.md. Most tasks add nothing.
   - Only add a note if it is BOTH (a) non-obvious from the code, and (b) applicable to ANY future task in this repo (not just this feature).
   - One terse line per note. No prose paragraphs. No task-specific context.
   - If unsure whether it qualifies, skip it.

6. **Commit** (REQUIRED unless there is nothing committable)
   - Use the VCS detected in the preamble. For git, use `git add` / `git commit` / `git log -1`. For any other VCS, substitute the equivalent stage / commit / log commands.
   - Determine the file set:
     * Always include: all code changes, and AGENTS.md (if you updated it).
     * If `PLANS_IGNORED=false`: also include the task file (`.plans/tasks-<feature>.yml`) and progress file (`.plans/progress-<feature>.txt`).
     * If `PLANS_IGNORED=true`: do NOT stage anything under `.plans/` — those files are intentionally untracked. Commit only code (+ AGENTS.md if changed).
   - Commit message format: `<feature>-<task-id>: <descriptive message>`
   - Example: `<feature>-task-003: add password hashing with bcrypt`
   - Verify the commit succeeded (git: `git log -1`; others: equivalent).
   - Record the finalized revision identifier after the commit succeeds. For git, use `git rev-parse HEAD`.
   - DO NOT push to remote.

CRITICAL: A commit is required whenever there are committable changes. The only valid reasons to skip are (a) `PLANS_IGNORED=true` AND the task produced no code/AGENTS.md changes, or (b) no changes exist at all — both indicate something is off; investigate.

## FINALIZE OUTPUT

At the end, output these lines:
FINALIZED: <task-id>
FINALIZED_CHANGESET: <commit-hash-or-revision>

Only output these markers AFTER you have successfully created the git commit, and ensure `FINALIZED_CHANGESET` is the exact revision the parent agent must merge or cherry-pick back into the caller worktree.
````

---

## Important Notes

- Each iteration MUST be launched as a separate forked Agent to prevent context bloat across iterations
- The Agent prompt must be fully self-contained — include all file paths and instructions
- Replace all `<placeholders>` with actual values before launching the Agent
- If an iteration fails, report the error and continue with the next iteration
- Track TASK_COMPLETED, FINALIZED, and FINALIZED_CHANGESET markers from Agent output to report progress, and verify merge-back into the caller worktree before continuing
