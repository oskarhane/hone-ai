---
description: Run the full hone chain hands-free — prd → prd-to-tasks → run → review → fix loop — from a single feature description. Stops once up front for batched PRD questions, then drives every transition mechanically. Use to take a feature from idea to reviewed, committed implementation in one command.
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

_(filled in by a later task — execute `prd-to-tasks/SKILL.md` inline against
`.plans/prd-<slug>.md` and capture `N`)_

## Phase 3: Run

_(filled in by a later task — execute `run/SKILL.md` inline with `-i N`, auto-create the
`hone/<slug>` branch)_

## Phase 4: Review→fix loop

_(filled in by a later task — for `round` 1..`max_rounds`, run `review/SKILL.md` inline
and route on its closing line to `fix/SKILL.md`)_

## Control behaviors

_(filled in by a later task — resume-from-state, halt-on-failure, and the final report)_
