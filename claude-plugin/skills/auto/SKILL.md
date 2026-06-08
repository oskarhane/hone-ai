---
description: Runs the full hone chain hands-free — prd → prd-to-tasks → run → review → fix loop — from a single feature description. Stops once up front for batched PRD questions, then drives every transition mechanically. Use when taking a feature from idea to reviewed, committed implementation in one command.
---

Orchestrate the full hone chain from a single feature description, hands-free:
**prd → prd-to-tasks → run → review → (fix → re-review)\***. Drive every transition
mechanically by reading each phase's sibling `SKILL.md` and executing it inline — never
copy-pasting or paraphrasing its logic — so this skill auto-syncs when a sub-skill
changes. Stop for the user exactly once, up front, to answer batched PRD clarifying
questions; if codebase analysis answers everything, run fully unattended.

## CRITICAL: main-context requirement

This skill MUST run in the **main conversation context**. It MUST NOT be invoked as a
forked subagent (e.g. via the Agent/Task tool). The run phase forks an Agent per
iteration, and forked agents cannot nest — a nested fork will fail. If you are already
running inside a forked agent, stop immediately and report that `/hone:auto` must be run
from the top-level conversation.

## Step 0: Parse arguments

`$ARGUMENTS` is free-form text: a feature description, optionally followed by flags. The
feature description may itself contain file paths or URLs (handled later by the PRD phase
exactly as `/hone:prd` does). Extract:

- `feature_description`: everything that is not a recognized flag. This is the natural-
  language feature description passed to the PRD phase.
- `max_rounds`: the value of `--max-rounds N` (also accept `--max-rounds=N`). Default `3`
  when absent.
- `skip_review`: `true` if any form of skip-review flag is present (`--skip review`,
  `--skip-review`, `--skip=review`, `skip review`). Default `false`.

Be flexible with flag formatting. Strip the recognized flags out of the text before
treating the remainder as `feature_description`.

## Shared variables (threaded through every phase)

Establish these once and carry them through all phases so every phase reads/writes the
same `.plans/` files and all commits land on the same feature branch:

- `slug` — the feature slug. Captured in the PRD phase from the actual saved
  `.plans/prd-<slug>.md` path, then used to derive `.plans/tasks-<slug>.yml` and
  `.plans/progress-<slug>.txt`, and the branch name `hone/<slug>`.
- `N` — the number of generated tasks. Captured in the Tasks phase, passed to the Run
  phase as `-i N`.
- `max_rounds` — the review→fix loop cap (from Step 0, default `3`).
- `skip_review` — whether to skip per-iteration review in the Run phase (from Step 0).

## Phase-banner convention

At each phase transition, print a single-line banner so an unattended run leaves a
visible trail. Format:

```
━━━ HONE:AUTO — <FROM> done → <TO> ━━━
```

Examples: `━━━ HONE:AUTO — PRD done → generating tasks ━━━`,
`━━━ HONE:AUTO — run complete → reviewing ━━━`,
`━━━ HONE:AUTO — review blocking → fix round 2 ━━━`. Each phase section below prints its
own banner on entry; later tasks fill in the exact wording.

## Step 1: Resume from state

Before entering Phase 1, run the **Resume from state** behavior under Control behaviors. It
resolves a candidate slug from `feature_description`, inspects existing `.plans/` files, and
either adopts the existing slug and jumps to the first incomplete phase (Tasks, Run, Review,
or straight to the Final report) or — when nothing matches — falls through to Phase 1 as a
fresh run. Every phase below is entered _through_ this gate, so a re-invocation never redoes
completed work. Throughout the run, also honor the **Halt on failure** behavior: any phase
that cannot produce valid state for the next one stops the chain with a halt report instead
of advancing.

## Phase 1: PRD

Read the prd skill's instructions from `claude-plugin/skills/prd/SKILL.md` (sibling
directory in the installed plugin) and execute its **Steps 1–3, 5, and 6** inline against
`feature_description` as the `$ARGUMENTS` input. Do not copy-paste or paraphrase those
steps here — re-read that file and follow it verbatim, so this phase auto-syncs when the
prd skill changes.

Apply these overrides while executing it:

- **Override Step 4 (clarifying questions).** Do not ask one question at a time. From the
  Step 2 codebase analysis and Step 3 references, derive the highest-value clarifying
  questions — those NOT already answerable from that analysis — and ask **up to 4** in a
  **single `AskUserQuestion` call** (the tool's maximum is 4 questions). Pick the 4 that
  most reduce ambiguity if more than 4 exist. **If the analysis answers everything, skip
  the prompt entirely** — issue no `AskUserQuestion` call and proceed straight to Step 5,
  running fully unattended. Feed the answers (if any) into Step 5 generation.

- **Suppress Step 7.** Do not emit the prd skill's "Next steps" output — the orchestrator
  owns all phase transitions.

After Step 6 saves the PRD, **capture `slug` from the actual saved path**
`.plans/prd-<slug>.md` (read back the path the skill wrote, don't re-slugify). Store it in
the shared `slug` variable; all downstream phases derive their `.plans/` paths and the
branch name from it.

Then emit the phase-transition banner and proceed to Phase 2:

```
━━━ HONE:AUTO — PRD done → generating tasks ━━━
```

## Phase 2: Tasks

Read the prd-to-tasks skill's instructions from
`claude-plugin/skills/prd-to-tasks/SKILL.md` (sibling directory in the installed plugin)
and execute them inline against `.plans/prd-<slug>.md` as the `$ARGUMENTS` input — using
the `slug` captured in Phase 1. Do not copy-paste or paraphrase those steps here — re-read
that file and follow it verbatim, so this phase auto-syncs when the prd-to-tasks skill
changes. It writes `.plans/tasks-<slug>.yml`.

Apply these overrides while executing it:

- **Suppress Step 4's "Now run /hone:run …" output.** Do not emit the prd-to-tasks skill's
  trailing run instruction — the orchestrator owns all phase transitions.

After Step 3 writes the task YAML, **record `N` = the number of generated tasks** into the
shared `N` variable. The Run phase passes it through as `-i N`. The
`.plans/tasks-<slug>.yml` and `.plans/progress-<slug>.txt` paths are derived from the
shared `slug`.

Then emit the phase-transition banner and proceed to Phase 3:

```
━━━ HONE:AUTO — tasks generated → running ━━━
```

## Phase 3: Run

Read the run skill's instructions from `claude-plugin/skills/run/SKILL.md` (sibling
directory in the installed plugin) and execute its **VCS detection** and **Step 2: Run
iterations** inline against `.plans/tasks-<slug>.yml` with `N` iterations (`-i N`, using
the `N` captured in Phase 2) and `skip_review` from Step 0. Do not copy-paste or paraphrase
those steps here — re-read that file and follow it verbatim, including the full
per-iteration Agent prompt, so this phase auto-syncs when the run skill changes.

Apply these overrides while executing it:

- **Override the run skill's Pre-step branch gate.** The orchestrator runs unattended, so
  do NOT ask the user whether to create a branch. Instead, deterministically auto-create
  the feature branch `hone/<slug>` (using the detected VCS) without prompting: if it does
  not already exist, create and switch to it; if it already exists, switch to it. This
  replaces run's "ask the user … suggest a good name" behavior entirely. The rest of the
  Pre-step — committing the PRD and tasks files when `PLANS_IGNORED=false` — still applies.

Everything else in the run skill is inherited unchanged — do NOT redefine it here. In
particular: honor the `<promise>COMPLETE</promise>` early-exit (stop iterating early when a
child Agent reports all tasks done), and preserve the child-commit merge-back behavior
(bringing each finalized child commit back into the caller worktree, verified, before the
next iteration). Suppress the run skill's trailing
`Next: /hone:review for a strict end-of-feature audit` line — the orchestrator owns the
transition into the Review→fix loop.

Then emit the phase-transition banner and proceed to Phase 4:

```
━━━ HONE:AUTO — run complete → reviewing ━━━
```

## Phase 4: Review→fix loop

If `skip_review` is `true`, skip this phase entirely and proceed to the Control behaviors'
final report — there is nothing to review against.

Otherwise iterate for `round` = 1 to `max_rounds`. Each round runs the review skill inline,
then routes **solely on review's closing-line contract**:

### Review step

Read the review skill's instructions from `claude-plugin/skills/review/SKILL.md` (sibling
directory in the installed plugin) and execute it inline against `.plans/tasks-<slug>.yml`
as the `$ARGUMENTS` input. Do not copy-paste or paraphrase those steps here — re-read that
file and follow it verbatim, so this phase auto-syncs when the review skill changes.

Capture the review's **closing line** and branch on it — and on nothing else (do not invent
a new signal):

- **`Nothing blocking.`** (review printed no `/hone:fix` line) → the branch is clean. Exit
  the loop as **success** and proceed to the Control behaviors' final report.
- **`Run /hone:fix <tasks-file> the above blocking issues`** → review is blocking. Proceed
  to the Fix step of this round.

### Fix step

Emit the review→fix banner, then read the fix skill's instructions from
`claude-plugin/skills/fix/SKILL.md` (sibling directory in the installed plugin) and execute
it inline against `.plans/tasks-<slug>.yml` with the back-reference payload
`the above blocking issues` (resolving to the review audit just printed). Do not copy-paste
or paraphrase those steps here — re-read that file and follow it verbatim, so this phase
auto-syncs when the fix skill changes.

Apply this override while executing it:

- **Override fix Step 3 (the `AskUserQuestion` multi-select).** The orchestrator runs
  unattended, so do NOT prompt the user to pick findings. Instead, **auto-select every
  blocking / high-priority candidate finding** the fix skill's Step 2 resolved — i.e. all
  blockers / presumptive blockers / must-fix items and review Output priority 1–3 findings
  (structural regressions, missed code-judo simplifications, spaghetti growth). Treat that
  auto-selection as the user's picks and proceed to fix Step 4. If Step 2 resolved zero such
  candidates, treat the round as having no actionable findings: exit the loop as success and
  proceed to the final report.

Everything else in the fix skill is inherited unchanged — do NOT redefine it here. In
particular it appends the selected findings as new tasks, commits them, and runs its inline
iteration loop over them. Suppress the fix skill's trailing
`Next: /hone:prune to archive the feature.` line — the orchestrator owns the transition back
into the next review round.

After the Fix step completes, emit the fix→re-review banner and continue to the next
`round`:

```
━━━ HONE:AUTO — review blocking → fix round <round> ━━━
━━━ HONE:AUTO — fix round <round> done → re-reviewing ━━━
```

### Hard cap

The loop runs at most `max_rounds` rounds — there is no other exit and no recursion, so it
can never loop forever. If `round` reaches `max_rounds` and that round's review is **still
blocking** after its fix completed (or `max_rounds` is exhausted without a `Nothing
blocking.` result), stop the loop and treat the remaining blocking findings as
**unresolved**. Do not run another round. Record those still-blocking findings (from the
last review's audit) so the Control behaviors' final report can list them as unresolved,
then proceed to that final report.

## Control behaviors

These three behaviors are cross-cutting — they wrap the phase flow above rather than
living inside any single phase.

### Resume from state

Runs **once, immediately after Step 0 (arg parsing) and before Phase 1**. The orchestrator
is re-entrant: a prior `/hone:auto` run that was interrupted (or any equivalent manual
`/hone:` work) leaves `.plans/` files behind, and re-invoking on the same feature must
continue from the first incomplete phase instead of redoing finished work.

The slug is normally captured _inside_ Phase 1, so before Phase 1 you do not yet have it.
Resolve a **candidate slug** by slugifying `feature_description` the same way `prd/SKILL.md`
does, then probe `.plans/` for files matching that slug (also accept a close match if a
single `prd-*.md` plus `tasks-*.yml` pair clearly corresponds to this feature). If a
matching PRD is found, adopt its slug as the shared `slug` for the whole run.

Infer phase-completeness from `.plans/` state and jump to the **first incomplete phase**:

- **No `.plans/prd-<slug>.md`** → nothing exists; start at **Phase 1 (PRD)** as a fresh run.
- **PRD exists, no `.plans/tasks-<slug>.yml`** → PRD is done; skip Phase 1, capture `slug`
  from the existing PRD path, start at **Phase 2 (Tasks)**.
- **PRD + tasks exist, and any task still has `status: pending` (or `in_progress`)** → set
  `N` = total task count in the file, skip Phases 1–2, start at **Phase 3 (Run)**. The run
  skill's own per-task `status` gating skips already-`completed` tasks, so re-entering Run
  resumes mid-list rather than re-implementing finished tasks.
- **PRD + tasks exist, all tasks `status: completed`, review not yet clean** → implementation
  is done; skip Phases 1–3 and enter **Phase 4 (Review→fix loop)** at round 1.
- **PRD + tasks exist, all tasks completed, and a prior review already ended `Nothing
blocking.`** → everything is done; skip straight to the **Final report** (success).

When resuming, print a banner naming the resume point before diving in, e.g.:

```
━━━ HONE:AUTO — resuming <slug> at run (3 of 7 tasks pending) ━━━
```

If no `.plans/` files match the candidate slug, this is a fresh run: proceed to Phase 1
normally (which will capture the real slug from the saved PRD path).

### Halt on failure

Any phase that **cannot produce valid state for the next phase** halts the chain
immediately. Do not advance to a later phase on bad or incomplete state, and do not emit the
success final report. Halt cases:

- **Phase 2 (Tasks) yields zero tasks** — `prd-to-tasks` wrote a tasks file with an empty
  `tasks:` list (or wrote none). Halt before Phase 3.
- **Phase 3 (Run) cannot complete a task** — a child iteration exhausts the run skill's
  retries without producing `FINALIZED` for its task (the task never reaches
  `status: completed`). Halt before Phase 4.
- **A phase errors out** — a sub-skill aborts (e.g. PRD generation fails, VCS detection
  finds no usable repo). Halt at that phase.

This is **distinct from the review→fix loop exhausting `max_rounds`**: that is _not_ a halt.
Unresolved blocking findings after `max_rounds` still produce a final report — the
implementation is committed and valid, the review outcome is simply `unresolved`. Halt is
reserved for the cases above, where downstream phases would run against broken state.

On halt, emit a banner and a **halt report** (not the success final report):

```
━━━ HONE:AUTO — HALTED at <phase> ━━━
```

The halt report states:

- **Stopped at**: which phase failed and why (one line).
- **Slug / PRD path**: the resolved `slug` and `.plans/prd-<slug>.md` (if it exists yet).
- **Committed**: what has landed on `hone/<slug>` so far (PRD/tasks commit, plus any tasks
  whose child commit was merged back) — read from VCS / task `status: completed`.
- **Pending**: what remains (tasks still `pending`/`in_progress`, phases not reached).
- **Resume hint**: `Re-run /hone:auto on this feature to resume from the failed phase.`

### Phase-transition banners

Each phase section above emits its own banner on entry/exit per the **Phase-banner
convention** defined near the top of this skill — do not redefine the format here. The
control layer only adds the **resume banner** and **halt banner** shown above. Ensure a
banner is printed at every handoff so an unattended run leaves a complete visible trail.

### Final report

Emitted once the chain reaches a successful terminus — Phase 4 exited `Nothing blocking.`,
`max_rounds` was exhausted (outcome `unresolved`), or `skip_review` short-circuited Phase 4.
(A halt produces the halt report above instead.) Print:

```
━━━ HONE:AUTO — complete ━━━

Feature: <slug>
PRD: .plans/prd-<slug>.md
Tasks implemented: <N> (+ <R> review tasks added across <rounds> fix round(s))
Review: <clean | unresolved after <max_rounds> rounds | skipped>
```

Followed by, on its own line:

```
Next: /hone:pr to push the branch and open a PR, then /hone:prune to archive when ready.
```

Field rules:

- **Tasks implemented** `<N>` — the task count captured in Phase 2 (the original PRD tasks).
- **Review tasks added** `<R>` — total new tasks the Fix step(s) appended across all rounds
  (sum of findings auto-selected and appended to `.plans/tasks-<slug>.yml`). `0` if none.
  Omit the parenthetical entirely when `R` is `0` and no fix rounds ran.
- **Review** — `clean` if Phase 4 exited on `Nothing blocking.`; `unresolved after
<max_rounds> rounds` if the cap was hit while still blocking (list the still-blocking
  findings from the last review beneath the report); `skipped` if `skip_review` was set.
