---
description: Take a tasks file and a description of issues to fix (literal text or a back-reference like "the above blocking issues"), prompt the user to pick which become new tasks, append them to .plans/tasks-<feature>.yml, then run the iteration loop on those tasks.
---

Convert review findings (or any free-text list of issues) into new tasks and drive them through the same iteration loop `/hone:run` uses.

## Step 1: Parse arguments

`$ARGUMENTS` is free-form text shaped like: `<tasks-file> <free-text issues payload>`

- First token: tasks-file path (e.g. `.plans/tasks-<feature>.yml`). If the first token doesn't look like a path or doesn't exist, treat `$ARGUMENTS` as all-payload and fall back to the most recently modified `.plans/tasks-*.yml`.
- Remainder: the issues payload — either literal issue text (paragraphs, bullets, a pasted review) OR a back-reference like `the above blocking issues`, `the findings above`, `the review`, `what we just discussed`.

Derive `<feature>` from the tasks-file name: `tasks-<feature>.yml` → `<feature>`. Validate the tasks file exists.

## Step 2: Resolve the issues payload

- **Literal text** — parse the payload directly into a list of candidate findings. One finding per paragraph or bullet.
- **Back-reference** — locate the referenced content in the current conversation. Prefer the most recent `/hone:review` output; otherwise the immediately-preceding review-like discussion (PR review, code-quality discussion, etc.). Extract the findings from that content.

When building the candidate list, bias toward blockers and highest-priority items:

- Anything flagged as a blocker / presumptive blocker / must-fix.
- Highest-priority categories from `/hone:review`: structural regressions, missed code-judo simplifications, spaghetti growth (Output priority 1–3).
- Anything else the user clearly framed as needing action.

If the payload can't be resolved (back-reference with nothing matching, or empty literal text), output exactly:

```
No issues found to act on. Pass the issues as text, or run /hone:fix right after /hone:review.
```

…and stop.

## Step 3: Prompt the user

Use `AskUserQuestion` with multi-select. One option per candidate finding, short label per item, concise description summarizing the issue. The user picks which findings become tasks.

If there are zero candidates, OR the user picks nothing, output a warm closing message like:

```
Branch is clean — no blockers, no high-priority findings. Nice work. Run /hone:prune when you're ready to archive.
```

…and stop.

## Step 4: Append tasks

For each picked finding, append a task entry to `<tasks-file>`:

- `id`: next sequential id (look at existing task ids; if highest is `task-007`, next is `task-008`).
- `status: pending`.
- `description`: the full finding as a paragraph. Preserve the reviewer's reasoning intact — the implementing agent needs the *why*, not just the *what*. Don't compress to a one-liner.
- `acceptance_criteria`: a clear, testable criterion derived from the finding.
- `source: review` — new field, distinguishes review-derived tasks from PRD-derived ones.

## Step 5: Append a progress note

Append to `.plans/progress-<feature>.txt`:

```
## REVIEW — <ISO-8601-datetime>
Added <N> review tasks (task-<a>..task-<b>).
```

## Step 6: Run the iteration loop inline

Read the run skill's instructions from `claude-plugin/skills/run/SKILL.md` (sibling directory in the installed plugin). Execute its **Step 2: Run iterations** inline against `<tasks-file>` with `N = number of new tasks added`. Reuse the run skill's full per-iteration Agent prompt **verbatim** — do not paraphrase or duplicate it here. When the run loop changes, this skill must stay in sync automatically by re-reading that file.

Skip the run skill's "Pre-step" (branch creation / PRD commit). Those are already in place by the time `/hone:fix` is invoked.

## Step 7: Final output

After all iterations complete, output:

```
Completed <actual> iterations (of <N> requested)
Next: /hone:prune to archive the feature.
```
