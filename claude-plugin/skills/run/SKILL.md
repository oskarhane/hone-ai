---
name: run
description: Execute the hone implement/review/finalize loop. Claude directly implements tasks from a task file, reviews changes, and commits. Each iteration runs in a forked agent context.
---

Execute the hone task implementation loop.

## Step 1: Parse arguments

`$ARGUMENTS` is free-form text like: `.plans/tasks-feature.yml -i 5 --skip review`

Extract these values (be flexible with format — users may use `-i 5`, `-i=5`, `--iterations 5`, etc.):
- `tasks-file`: the `.plans/tasks-*.yml` path (usually the first argument)
- `N`: number of iterations (from `-i`, `--iterations`, or similar)
- `skip_review`: whether any form of skip was requested (`--skip`, `--skip review`, `--skip=review`, `skip review`, etc.)

Validate the tasks file exists. Extract feature name from filename: `tasks-<feature>.yml` -> `<feature>`.

## Step 2: Run iterations

For each iteration from 1 to N, launch a **forked Agent** (using the Agent tool) with the full prompt below. Each iteration gets a fresh context to prevent bloat.

If the Agent output contains `<promise>COMPLETE</promise>`, all tasks are done — stop iterating early.

After all iterations complete, report:
```
Completed <actual> iterations (of <N> requested)
```

## Full Agent Prompt for Each Iteration

The Agent prompt MUST include the tasks file path, feature name, whether to skip review, and the full instructions below. Construct it as follows:

---

```
# HONE: ITERATION <i> of <N>

Feature: <feature>
Tasks file: <tasks-file>
Skip review: <yes/no>

# PHASE 1: IMPLEMENT

## CONTEXT FILES — READ ALL OF THESE FIRST

Read the following files before doing anything else:
- <tasks-file> (the task YAML file — this is your source of truth for tasks)
- .plans/progress-<feature>.txt (development log — read if it exists)
- AGENTS.md (CRITICAL: contains feedback commands for this project — test, build, lint, format)
- .plans/hone.config.yml (if exists, check for lintCommand)

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

## FEEDBACK LOOPS

Run feedback loops ONLY when the task implementation is complete.

IMPORTANT: Get the feedback commands from AGENTS.md — they are project-specific.
Look for the "Feedback Instructions" section which lists TEST COMMANDS, BUILD COMMANDS, LINT COMMANDS, and FORMAT COMMANDS. Run these commands.

If AGENTS.md has no feedback instructions and .plans/hone.config.yml has a lintCommand, run that.

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

Launch the `hone-reviewer` subagent to review the changes. Pass it:
- The task file path so it can check for in_progress tasks
- Tell it to review the git diff

Wait for the review feedback.

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
     ================================================================================
     TASK-XXX: <task-title>
     Date: <ISO-8601-datetime>
     ================================================================================

     Summary:
     <concise summary of what was done>

     Files Changed:
     - file1.ts (created/modified/deleted with brief description)
     - file2.ts (...)

     Key Decisions:
     - Decision 1
     - Decision 2

     Next Task: <next-task-id> or "All tasks complete"
     ```

5. **Update AGENTS.md file**
   - Add useful learnings and gotchas under appropriate heading
   - Be terse — only add truly useful info that future agents need
   - Don't duplicate existing info

6. **Git Commit** (REQUIRED — DO NOT SKIP THIS STEP)
   - You MUST create a git commit for this task to be considered complete
   - Stage all changes using: `git add <files>`
     * Task file (.plans/tasks-<feature>.yml)
     * Progress file (.plans/progress-<feature>.txt)
     * All code changes
     * AGENTS.md (if you updated it)
   - Commit with format: `<feature>-<task-id>: <descriptive message>`
   - Example: `git commit -m "user-auth-task-003: add password hashing with bcrypt"`
   - Verify commit succeeded by checking `git log -1` shows your commit
   - DO NOT push to remote

CRITICAL: The git commit is NOT optional. Without it, your work will not be properly tracked.
If you cannot commit (e.g., no changes to commit), that indicates a problem — investigate and fix it.

## FINALIZE OUTPUT

At the end, output on a single line:
FINALIZED: <task-id>

Only output this marker AFTER you have successfully created the git commit.
```

---

## Important Notes

- Each iteration MUST be launched as a separate forked Agent to prevent context bloat across iterations
- The Agent prompt must be fully self-contained — include all file paths and instructions
- Replace all `<placeholders>` with actual values before launching the Agent
- If an iteration fails, report the error and continue with the next iteration
- Track TASK_COMPLETED and FINALIZED markers from Agent output to report progress
