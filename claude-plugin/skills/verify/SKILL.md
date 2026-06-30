---
description: Verifies that each completed task's acceptance_criteria is actually satisfied by the committed code. Mapping criteria to commits and the specific test/code that demonstrates them, with strict evidence tiers (verified by a passing test vs. merely asserted). Chat output only. Use after /hone:run to gate "agent said done" against "criteria is met".
---

# Hone Verify

Close the loop between **"the agent marked this task complete"** and **"its acceptance criteria are actually satisfied by the committed code."** For every completed task in the tasks file, produce an evidence table showing the criterion => the commit(s) that delivered it => the specific test or code that demonstrates it => a report/breakdown table.

This is a correctness/evidence gate, not a style audit: a criterion is only **VERIFIED** when a concrete, executable artifact demonstrates it, not because the code "looks right."

## How this differs from /hone:review

`/hone:review` audits **maintainability** (abstraction health, file size, spaghetti, code-judo). `/hone:verify` is a **fresh-context, post-hoc, cross-task re-check of plan vs. reality**. The two are complementary: verify proves the feature does what the PRD asked; review proves it's built cleanly.

## Arguments

`$ARGUMENTS` is optional. If present, treat it as `<tasks-file>` (e.g. `.plans/tasks-<feature>.yml`). If absent, pick the most recently modified `tasks-*.yml` in `.plans/`. Derive `<feature>` from the filename. **Do NOT write any file! This skill outputs to chat exclusively.** (Running the project's read-only feedback commands to gather evidence is expected and encouraged; mutating source, tasks, or progress files is not.)

## Detect once at start

Reuse these facts for the whole run:

1. **VCS in use.** Default to `git`. If the repo root signals a different VCS (`.jj/`, `.hg/`, `.sl/`, …), use that instead and substitute the equivalent log / grep / diff commands, do not run `git` commands.
2. **Base ref.** The branch point this feature diverged from (for git, typically `git merge-base HEAD master` / `main` / `trunk`). Used to scope the branch diff when commit mapping is incomplete.
3. **Feedback commands.** Read `AGENTS.md`=> "Feedback Instructions" for TEST / BUILD / LINT commands. These are how you turn "code exists" into "criterion demonstrably passes."

## Step 1: Select the tasks to verify

Read `<tasks-file>`. Verify **only tasks with `status: completed`**. List any `pending` / `in_progress` tasks separately at the end as "not yet claimed. Out of scope for verification." Read `.plans/progress-<feature>.txt` if it exists; its `## TASK-XXX` entries are a secondary evidence source.

## Step 2: Map each task to its delivering commit(s)

The durable task => commit link is the commit-message convention `/hone:run` uses: `<feature>-<task-id>: <message>`.

- **Primary:** for git, `git log --grep="<feature>-<task-id>"` (and inspect those commits with `git show`). For other VCSes, the equivalent log-grep + show.
- **Fallback** (squashed/amended history, or `.plans/` was ignored so the task file isn't in history): scope to the branch diff vs. the base ref, the `progress-<feature>.txt` entry for the task, and the current working tree. When you fall back, **say so and lower the mapping confidence**. An unmappable task cannot be VERIFIED.

Record, per task, the commit hash(es)/revisions you'll cite as evidence.

## Step 3: Judge each acceptance criterion against the evidence

For every criterion of every completed task, assign exactly one tier. **Be strict when evidence is ambiguous, drop a tier, never round up.**

- **VERIFIED**: a concrete, executable artifact demonstrates the criterion **and you observed it pass**:
  - a test that exercises this criterion, which you ran (via the AGENTS.md test command) and saw pass
  - or a runnable check/command whose output you observed satisfy the criterion
  - or for non-code criteria (a file must exist / contain X, config/docs), the artifact you read directly and unambiguously satisfies it.
- **ASSERTED**: code that plausibly implements the criterion exists, but **no test or executable evidence demonstrates it**. This is a finding (the criterion needs a test), not a pass.
- **UNVERIFIED**: no evidence the criterion is met, the evidence contradicts it, or the task could not be mapped to any change.

### Anti-rubber-stamp rules (non-negotiable)

- "I read the code and it looks correct" is **ASSERTED**, never VERIFIED.
- A criterion claiming behavior (validates X, rejects Y, returns Z) is VERIFIED **only** if a test or command actually exercised that behavior and passed in this run. If the test suite doesn't cover it, it's ASSERTED.
- If you cannot run the feedback commands (none defined, or they fail to run), no behavioral criterion can be VERIFIED this run. Cap it at ASSERTED and note why.
- A task whose commit you couldn't find is UNVERIFIED regardless of how the code looks.

### Task verdict (roll-up)

- **VERIFIED: `<task-id>`**: every criterion is VERIFIED.
- **PARTIAL: `<task-id>`**: no UNVERIFIED criteria, but at least one is ASSERTED (works-on-paper, untested).
- **UNVERIFIED: `<task-id>`**: at least one criterion is UNVERIFIED.

## Output

For each completed task, print a header line with its verdict, then a compact evidence table:

```
UNVERIFIED: task-004 => "Add rate limiting to the login endpoint"
  commits: a1b2c3d (feature-task-004: add token-bucket limiter)

  | criterion                                  | evidence                                   | tier       |
  | ------------------------------------------ | ------------------------------------------ | ---------- |
  | Rejects >5 attempts/min with 429           | test_login_rate_limit (ran, passed)        | VERIFIED   |
  | Limit is configurable via env              | reads RATE_LIMIT in config.ts:14, no test  | ASSERTED   |
  | Counter resets after the window            | no test, behavior not exercised anywhere   | UNVERIFIED |
```

Keep evidence cells terse and concrete. Cite the test name, file:line, or command output, not prose. Prefer high-signal pointers over narration.

After the per-task tables, print a one-line tally: `Verified <v> · Partial <p> · Unverified <u> of <n> completed tasks` and list any non-completed tasks skipped.

## Closing Output

End on exactly one of these, using the resolved tasks-file path (never a placeholder):

- **Anything actionable** (any UNVERIFIED criterion, or any ASSERTED criterion you think warrants a test),  print:

  ```
  Run /hone:fix <tasks-file> the above unverified criteria
  ```

  Example: `Run /hone:fix .plans/tasks-user-auth.yml the above unverified criteria`. The phrase `the above unverified criteria` is a back-reference, `/hone:fix` resolves it against the verification audit you just printed, turning the gaps into tasks (e.g. "add a test for the window-reset behavior").

- **Everything VERIFIED**: do NOT suggest `/hone:fix`. Print a short closing line, keeping the first line's text exactly (it's the success sentinel a wrapper can parse), then the next step:

  ```
  All criteria verified.
  Next: /hone:review for a maintainability audit, or /hone:pr to publish.
  ```

