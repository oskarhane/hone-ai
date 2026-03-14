# PRD: Remove CLI, Keep Plugin Only

## Overview
Remove the standalone CLI version of hone-ai entirely and keep only the Claude Code plugin as the sole distribution method. This includes removing all TypeScript source code, build tooling, npm publishing, binary releases, and CLI-related documentation.

## Goals
- Single distribution channel: Claude Code plugin marketplace only
- Remove all CLI-related code, config, dependencies, and workflows
- Update all documentation to reflect plugin-only usage
- Simplify the project to just the plugin directory contents

## Non-Goals
- Rewriting or changing plugin skill behavior
- Adding new plugin features
- Changing the plugin's internal structure

## Requirements

### Functional Requirements
- REQ-F-001: Remove `src/` directory entirely (CLI entry point, all TS modules, all tests)
- REQ-F-002: Remove `scripts/` directory (generate-skill-content.ts)
- REQ-F-003: Remove `skills/` directory (generated skill content for npm, not the plugin skills)
- REQ-F-004: Remove compiled binaries (`hone-linux`, `hone-macos`) and `index.js.map` from repo
- REQ-F-005: Remove `bun.lock`, `tsconfig.json` — no more TS/Bun tooling needed
- REQ-F-006: Strip `package.json` down to project metadata + prettier only. Remove `bin`, `module`, `files`, `scripts` (except format), `peerDependencies`, and CLI deps (`commander`, `ai`, `js-yaml`). Remove devDeps except `prettier`. Regenerate lockfile
- REQ-F-008: Remove `.github/workflows/publish-npm-manual.yml` (npm publishing)
- REQ-F-009: Remove `.github/workflows/release-major.yml` and `release-minor.yml` (binary release workflows)
- REQ-F-010: Remove or heavily simplify `.github/workflows/ci.yml` — no TS to typecheck, no tests to run, no binaries to build
- REQ-F-011: Update `README.md` to remove all CLI references (Option B, CLI install instructions, `hone` command examples, binary download info). Keep only plugin installation and usage
- REQ-F-012: Remove old `AGENTS.md` and regenerate for the plugin-only project structure
- REQ-F-013: Remove CLI-specific config files: `.yamllint.yml`, `.editorconfig`. Keep `.prettierrc.yml` and `.prettierignore` (for md formatting)
- REQ-F-014: Update `.gitignore` to remove CLI build artifact entries (`/hone-*`, `xloop`, `index.js.map`, `*.tgz`, integration test dirs)
- REQ-F-015: Remove `.agents/` directory if it contains CLI-specific agent configs

### Non-Functional Requirements
- REQ-NF-001: The plugin in `claude-plugin/` must remain fully functional and unchanged
- REQ-NF-002: `hone.config.yml` in project roots (user projects) should continue to work with the plugin

## Technical Considerations
- The `claude-plugin/` directory is the sole deliverable — verify its contents are self-contained
- The plugin is published via the Claude Code plugin marketplace, not npm
- The `.plans/` directory and `hone.config.yml` stay in repo root (dogfooding)
- `package.json` kept but stripped to metadata + prettier dep only

## Acceptance Criteria
- [ ] No `src/`, `scripts/`, `skills/`, `bun.lock`, `tsconfig.json` exist
- [ ] No compiled binaries in repo
- [ ] No npm publish or binary release workflows
- [ ] `README.md` only documents plugin usage
- [ ] Plugin skills (`claude-plugin/skills/*`) work exactly as before
- [ ] `.gitignore` cleaned of CLI artifacts
- [ ] CI workflow either removed or simplified to plugin-relevant checks only

## Out of Scope
- Plugin feature changes or additions
- Plugin marketplace publishing process changes
- Changes to how the plugin skills work internally

## Open Questions
None — all resolved.
