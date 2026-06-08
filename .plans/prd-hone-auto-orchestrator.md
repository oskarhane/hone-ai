# PRD: `/hone:auto` Orchestrator Skill

## Overview

`/hone:auto` is a new hone skill that runs the full hone chain — **prd → prd-to-tasks → run → review → (fix → re-review)\*** — hands-free from a single feature description. Today the user is the connector between steps, hand-typing each `/hone:` command and copying the right file path into the next. `/hone:auto` becomes the missing **orchestrator**: it drives every transition mechanically, reads each phase's existing output contract to decide what runs next, and stops for the user only once — up front — to answer batched PRD clarifying questions.

This applies the chaining model from the MindStudio article ("Claude Code Skill Collaboration"): the three ingredients are a shared state layer, an orchestrator, and clean output contracts. Hone already has the shared state layer (`.plans/prd-<feature>.md`, `tasks-<feature>.yml`, `progress-<feature>.txt`) and clean output contracts (`TASK_COMPLETED`, `FINALIZED`, `FINALIZED_CHANGESET`, `<promise>COMPLETE</promise>`, and review's `Run /hone:fix … the above blocking issues` vs `Nothing blocking.`). The only missing ingredient is the orchestrator — currently a human. This skill fills that gap.

## Goals

- One command (`/hone:auto "<feature description>"`) takes a feature from description to reviewed, committed implementation on a feature branch with no inter-step typing.
- Stop for the user exactly once: a single batched prompt of up to 4 PRD clarifying questions, up front. If codebase analysis answers everything, run fully unattended with no prompt.
- Auto-route review↔fix as an iterative loop with an exit condition, capped at a configurable max rounds (default 3).
- Reuse existing sub-skills as the single source of truth — execute their `SKILL.md` instructions inline rather than duplicating logic, so the orchestrator auto-syncs when a sub-skill changes (the pattern `/hone:fix` Step 7 already uses for `/hone:run`).
- Fail explicitly: halt at the failed phase and report state rather than proceeding with bad data.
- Be resumable: detect existing `.plans/` files for the feature and continue from the first incomplete phase.

## Non-Goals

- Replacing or modifying the standalone skills (`prd`, `prd-to-tasks`, `run`, `review`, `fix`, `agents-md`, `prune`) — they remain independently invocable; overrides live only in the orchestrator.
- Including `agents-md` or `prune` in the chain — they stay separate manual steps.
- Changing the run loop's forking, parallelization, or merge-back behavior — inherited unchanged.
- Pushing to a remote, opening PRs, or any deployment action.
- A no-code / visual builder or any external integration (e.g. MindStudio plugin).

## Requirements

### Functional Requirements

- REQ-F-001: Add a new skill at `claude-plugin/skills/auto/SKILL.md`, invoked as `/hone:auto`. `$ARGUMENTS` is the feature description (may contain file paths / URLs, handled like `/hone:prd`). Optional flags: `--max-rounds N` (default 3) and `--skip review` (passed through to the run phase).
- REQ-F-002: The skill MUST run in the main conversation context and MUST NOT be invoked as a forked subagent, because the run phase forks an Agent per iteration and subagents cannot nest (cf. commit `54302d1`). State this constraint in the skill preamble.
- REQ-F-003: Drive each phase by reading the sibling `SKILL.md` (`prd`, `prd-to-tasks`, `run`, `review`, `fix`) and executing its instructions inline — do not copy-paste or paraphrase their steps. Mirror the contract `/hone:fix` Step 7 uses.
- REQ-F-004: **PRD phase** — execute `prd/SKILL.md` Steps 1–3, 5, 6 inline. Override Step 4: derive up to 4 highest-value clarifying questions and ask them in a single `AskUserQuestion` call (tool max is 4). If analysis answers everything, skip the prompt entirely (fully unattended). Suppress `prd` Step 7's "next steps" output. Capture the generated slug from the saved `.plans/prd-<slug>.md` path.
- REQ-F-005: **Tasks phase** — execute `prd-to-tasks/SKILL.md` inline against `.plans/prd-<slug>.md`. Suppress its "Now run /hone:run …" output. Record `N` = number of generated tasks.
- REQ-F-006: **Run phase** — execute `run/SKILL.md` VCS detection + Step 2 iteration loop inline against `.plans/tasks-<slug>.yml` with `-i N` (and `--skip review` if passed). Override the Pre-step branch gate: auto-create a feature branch named generically from the slug (e.g. `hone/<slug>`) without prompting. Honor the `<promise>COMPLETE</promise>` early-exit.
- REQ-F-007: **Review→fix loop** — for `round` 1..`--max-rounds`: run `review/SKILL.md` inline and capture its closing line. If `Nothing blocking.` → exit loop (success). If `Run /hone:fix <tasks-file> the above blocking issues` → run `fix/SKILL.md` inline with the review findings as the back-reference payload, overriding fix Step 3 to auto-select all candidate (blocking + high-priority) findings (no multi-select), then continue to the next round. If the cap is reached while still blocking → exit and report remaining findings as unresolved.
- REQ-F-008: Thread the feature slug through every phase so all phases read/write the same `.plans/` files and all commits land on the same feature branch.
- REQ-F-009: **Failure handling** — if a phase fails (e.g. run loop cannot complete a task after retries, or prd-to-tasks yields zero tasks), halt at that phase and report exactly where it stopped, what is committed, and what remains pending. Do not proceed to later phases with incomplete state.
- REQ-F-010: **Re-entrancy** — on invocation, detect existing `.plans/` files for the resolved slug and resume from the first incomplete phase (e.g. a tasks file with pending tasks → jump straight to the run phase) rather than redoing completed work.
- REQ-F-011: **Progress output** — print a short banner at each phase transition (e.g. `PRD done → generating tasks`, `Run complete → reviewing`, `Review blocking → fix round 2`), giving an unattended run a visible trail.
- REQ-F-012: Emit a final report: feature slug, PRD path, count of tasks implemented (+ review tasks added across fix rounds), review outcome (clean / unresolved after N rounds), and a `Next: /hone:prune to archive when ready.` line.
- REQ-F-013: Update `claude-plugin/README.md` — add `/hone:auto` to the skills table and a one-line hands-free usage example alongside the existing step-by-step example.
- REQ-F-014: Update root `AGENTS.md` — add `auto` to the "Workflow skills" line in the Architecture section.
- REQ-F-015: Bump `claude-plugin/.claude-plugin/plugin.json` version 1.11.1 → 1.12.0 (new feature, minor bump).

### Non-Functional Requirements

- REQ-NF-001: All content is Markdown/YAML only — no compiled code, no tests, no new dependencies (consistent with the project's plugin-only architecture).
- REQ-NF-002: Run `bun run format` (prettier) before committing, per AGENTS.md.
- REQ-NF-003: The review↔fix loop MUST have a hard exit condition (the round cap) so it can never run indefinitely.
- REQ-NF-004: The orchestrator must not duplicate sub-skill logic; when a sub-skill's `SKILL.md` changes, `/hone:auto` must pick up the change automatically by re-reading it.
- REQ-NF-005: Standalone invocation of every existing skill must remain unchanged after this feature.

## Technical Considerations

- **Inline-execution contract:** `/hone:fix` Step 7 already reads `claude-plugin/skills/run/SKILL.md` and executes it inline, verbatim. `/hone:auto` generalizes this across all five chained skills. Each phase section should name the exact file to read and the steps/overrides to apply.
- **Main-context requirement:** Because the run phase forks iteration Agents, the orchestrator must itself run at the top level. If invoked via the Skill tool in the main conversation this holds; the skill should explicitly warn against being wrapped in a subagent.
- **Routing signal:** The review closing line (review/SKILL.md:139–151) is the sole branch signal between review and fix — do not invent a new contract.
- **Slug capture:** `prd` slugifies the feature name and writes `.plans/prd-<slug>.md`. The orchestrator must read the actual saved path to learn the slug, then derive `tasks-<slug>.yml` / `progress-<slug>.txt` from it.
- **AskUserQuestion limit:** max 4 questions per call; PRD's nominal 5 is capped to 4 in batched mode — acceptable.
- **Resume detection:** phase completeness can be inferred from `.plans/` state — PRD exists? tasks exist? any `status: pending` tasks remain? — mirroring how the article treats the state file's stage field.

## Acceptance Criteria

- [ ] `claude-plugin/skills/auto/SKILL.md` exists with valid frontmatter `description` and is invocable as `/hone:auto`.
- [ ] `/hone:auto "<feature>"` runs prd → prd-to-tasks → run → review → fix loop with no manual typing between phases.
- [ ] PRD clarifying questions are asked in a single batched prompt up front; when analysis is sufficient, no prompt is shown.
- [ ] The feature branch is auto-created as `hone/<slug>` without prompting.
- [ ] The review↔fix loop auto-routes on review's closing line, auto-selects blocking/high findings in fix, and stops on `Nothing blocking.` or at `--max-rounds` (default 3).
- [ ] A phase failure halts the chain and reports where it stopped and what is committed/pending.
- [ ] Re-invoking on a feature with existing `.plans/` files resumes from the first incomplete phase.
- [ ] Phase-transition banners print during the run; a final summary report is emitted.
- [ ] README, AGENTS.md, and plugin.json (1.12.0) are updated.
- [ ] `bun run format` passes; all changes are Markdown/YAML only.
- [ ] Every existing skill still works when invoked standalone.

## Out of Scope

- `agents-md` and `prune` integration into the chain.
- Remote push, PR creation, deployment.
- Any external service / MindStudio integration or no-code builder.
- New automated tests or build tooling.
- Changes to run-loop parallelization or merge-back mechanics.

## Open Questions

None — design decisions (skill name `/hone:auto`, generic `hone/<slug>` branch, no-prompt when no questions needed, max-rounds 3, halt-on-failure, resume-from-state, phase banners) are all resolved.
