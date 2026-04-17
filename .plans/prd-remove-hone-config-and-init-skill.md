# PRD: Remove `hone.config.yml` usage and delete `/hone:init` skill

## Overview

`hone.config.yml` was inherited from the pre-plugin CLI (removed in c7edc23). No skill currently parses it. Only one field — `lintCommand` — is referenced anywhere in the plugin, and only as a fallback when `AGENTS.md` lacks feedback instructions. Everything else in the default config (`version`, `agent`, `claude.models`, `opencode.models`, `agentsDocsDir`) is dead: no code path reads it.

Once config creation is removed from `/hone:init`, the init skill has nothing left to do. Its only other action is `mkdir .plans/`, which `/hone:prd` already does itself (`claude-plugin/skills/prd/SKILL.md:9`). The skill becomes ceremonial.

This change removes the config file from the plugin surface area (creation, reading, docs) and deletes the `/hone:init` skill entirely. The existing `.plans/hone.config.yml` dogfooding file stays untouched on disk.

## Goals

- Eliminate the dead `hone.config.yml` code path from the plugin.
- Remove the ceremonial `/hone:init` skill.
- Make `AGENTS.md` the sole source of feedback commands (lint/test/build/format).
- Keep first-time setup frictionless: `/hone:prd` creates `.plans/` on demand.
- Ship as a minor version bump (1.4.0 → 1.5.0).

## Non-Goals

- Does NOT touch the `hone:run` phase-isolation architecture (implement/review/finalize — tracked separately).
- Does NOT delete the existing `.plans/hone.config.yml` from the repo.
- Does NOT change the `agents-md` skill's directory behavior beyond what's already there (`.agents/` stays hardcoded; user override remains via prompt).
- Does NOT touch archived PRDs or progress files referencing `hone.config.yml`.

## Requirements

### Functional Requirements

- REQ-F-001: Delete the entire `claude-plugin/skills/init/` directory (the `/hone:init` skill).
- REQ-F-002: Remove `.plans/hone.config.yml` from the CONTEXT FILES list in `claude-plugin/skills/run/SKILL.md` (currently line 63).
- REQ-F-003: Remove the `lintCommand` fallback sentence in `claude-plugin/skills/run/SKILL.md` (currently line 105: _"If AGENTS.md has no feedback instructions and .plans/hone.config.yml has a lintCommand, run that."_).
- REQ-F-004: Remove the Configuration section from `claude-plugin/README.md` (currently lines 74, 84-95).
- REQ-F-005: Remove the Configuration section from top-level `README.md` (currently lines 211, 221-231).
- REQ-F-006: Remove any `/hone:init` references from `claude-plugin/README.md` and top-level `README.md`. Where a reference described first-time setup, redirect users to `/hone:prd`.
- REQ-F-007: Bump plugin version from `1.4.0` to `1.5.0` in `claude-plugin/.claude-plugin/plugin.json`.

### Non-Functional Requirements

- REQ-NF-001: No regression in `/hone:run` when `AGENTS.md` exists and has Feedback Instructions — the primary feedback-loop path must keep working unchanged.
- REQ-NF-002: `/hone:prd` must still succeed in a clean working directory with no `.plans/` directory present.
- REQ-NF-003: The existing `.plans/hone.config.yml` file in the repo must not be deleted or modified by this change.
- REQ-NF-004: Archived files under `.plans/archive/` must not be touched.

## Technical Considerations

- **Manifest location:** the plugin manifest is at `claude-plugin/.claude-plugin/plugin.json` (confirmed during planning). The version bump goes there.
- **Ordering:** deletions and edits are independent — no sequencing constraints. One commit is fine.
- **Risk surface:** the `lintCommand` fallback was the only runtime behavior. Users who were relying on it must add the command to `AGENTS.md → Feedback Instructions → LINT COMMANDS` instead. This is a behavioral change worth a note in the commit/release message, but not a breaking API change.
- **Discovery of stray refs:** use `rg 'hone\.config|lintCommand' claude-plugin/ README.md` and `rg 'hone:init|/hone init' claude-plugin/ README.md` to confirm no leftover references. Hits under `.plans/archive/` are expected and ignored.
- **Skill listing change:** once `claude-plugin/skills/init/` is removed, `/hone:init` will disappear from the skill list automatically on next plugin reload.

## Acceptance Criteria

- [ ] `claude-plugin/skills/init/` directory is deleted.
- [ ] `.plans/hone.config.yml` bullet removed from `claude-plugin/skills/run/SKILL.md` CONTEXT FILES list.
- [ ] `lintCommand` fallback sentence removed from `claude-plugin/skills/run/SKILL.md`.
- [ ] Configuration section removed from `claude-plugin/README.md`.
- [ ] Configuration section removed from top-level `README.md`.
- [ ] No `/hone:init` references remain in `claude-plugin/README.md` or top-level `README.md`.
- [ ] `claude-plugin/.claude-plugin/plugin.json` shows `"version": "1.5.0"`.
- [ ] `rg 'hone\.config|lintCommand' claude-plugin/ README.md` returns zero hits.
- [ ] `rg 'hone:init|/hone init' claude-plugin/ README.md` returns zero hits.
- [ ] `.plans/hone.config.yml` is unchanged on disk.
- [ ] Manual run: `/hone:prd "throwaway test"` in a clean directory with no `.plans/` succeeds and creates the dir + PRD file.
- [ ] Manual run: `/hone:run` on an existing tasks file with `AGENTS.md` Feedback Instructions completes a feedback loop using AGENTS.md commands.

## Out of Scope

- Any restructuring of the `hone:run` skill's implement/review/finalize phase handling (separate concern — sub-agents cannot spawn sub-agents, but that refactor is deferred).
- Removal of `.plans/hone.config.yml` from the repo.
- Migration tooling to help existing users move `lintCommand` values from `hone.config.yml` into `AGENTS.md` (manual migration only; call it out in release notes).
- Any change to the `agents-md` skill.

## Open Questions

(none — all resolved during planning)
