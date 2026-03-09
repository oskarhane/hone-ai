Good, I have enough context. Now let me generate the PRD.

---

# PRD: `hone skill` Command — Install Hone Skill into Claude Code

## Overview

Add a `hone skill` CLI command that prints instructions for installing the bundled hone skill into `~/.claude/skills`, followed by the skill file contents. This lets users quickly bootstrap Claude Code with hone workflow knowledge without manually navigating the repo.

## Goals

- Generate a hone skill that can be installed via `hone skill` command. Use the skills-creator skill in claude to generate the actual skill from the README and CLI --help info.
- One-command discoverability: user runs `hone skill` and gets everything needed to install the skill.
- No network access required — all content is embedded in the binary/source.
- Works with both npm-installed and binary-distributed versions of hone.

## Non-Goals

- Automatic installation (no writing to `~/.claude/skills` without user consent).
- Updating or upgrading already-installed skills.
- Managing multiple skills or a skill registry.

## Requirements

### Functional Requirements

- **REQ-F-001**: `hone skill` command prints installation instructions to stdout explaining how to copy the skill to `~/.claude/skills/hone/SKILL.md`.
- **REQ-F-002**: Above the instructions, the command prints the full contents of `skills/hone/SKILL.md` (the skill file bundled in this repo).
- **REQ-F-003**: The output is formatted so users can pipe it, redirect it, or read it directly in the terminal.
- **REQ-F-004**: The skill file content is read from the repo-relative path `skills/hone/SKILL.md` at runtime (not hardcoded inline), so it stays in sync with the actual skill file.
- **REQ-F-005**: If the skill file cannot be found (e.g. standalone binary without asset bundling), the command prints a clear error message and exits with code 1.
- **REQ-F-006**: The command is registered in `src/index.ts` following existing Commander.js patterns.

### Non-Functional Requirements

- **REQ-NF-001**: No external dependencies introduced.
- **REQ-NF-002**: Command must work when hone is run via `bun src/index.ts`, `npm install -g hone-ai`, and as a standalone binary.
- **REQ-NF-003**: Output must be human-readable without piping through a pager.

## Technical Considerations

- **Skill file path resolution**: `import.meta.dir` (Bun) gives the directory of the executing source file. From `src/`, the path to the skill is `../skills/hone/SKILL.md`. For the compiled binary, Bun embeds assets specified in `bunfig.toml` or build config — verify bundling behavior and embed the skill file if needed.
- **Binary asset bundling**: Check whether `bun compile` supports embedding arbitrary files. If not, inline the skill content as a TypeScript constant as a fallback, keeping the live file as the source of truth read at dev-time.
- **Commander.js pattern**: Follow existing command structure in `src/index.ts` — no config loading needed for this command (similar to `init` which doesn't need `.plans/`).
- **Import style**: Use `import { readFile } from 'fs/promises'` consistent with codebase conventions (AGENTS.md pattern).

## Acceptance Criteria

- [ ] `hone skill` prints installation instructions including the target path `~/.claude/skills/hone/SKILL.md`.
- [ ] `hone skill` prints the full contents of `skills/hone/SKILL.md` after the instructions.
- [ ] Running `hone skill > /tmp/SKILL.md` produces a valid, complete SKILL.md file.
- [ ] `hone skill` exits 0 on success, 1 if skill file missing.
- [ ] Command appears in `hone --help` output.
- [ ] No new test failures; a unit test covers happy path and missing-file error path.

## Out of Scope

- Auto-installing the skill to `~/.claude/skills`.
- Versioning or diff-checking installed vs bundled skill.
- Supporting skill formats other than `SKILL.md`.

## Open Questions

1. Does `bun compile` embed `readFile`-accessed assets automatically, or does the skill file need to be inlined for the binary release? - Find out what's needed.
2. Should the install instructions include a ready-made `cp` command (e.g. `cp <(hone skill) ~/.claude/skills/hone/SKILL.md`), or keep it manual? - Keep it manual.
