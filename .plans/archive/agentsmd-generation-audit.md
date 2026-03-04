# AGENTS.md generation audit (baseline)

Date: 2026-02-17

Scope: current AGENTS.md generation sections, data sources, and hardcoded assumptions in `src/agents-md-generator.ts`.

## Sections emitted (order)

1. Feedback Instructions (always inline)
2. Project Overview (always)
3. Build System (always)
4. Testing Framework (conditional)
5. Architecture (conditional)
6. Deployment (conditional)
7. Footer/metadata lines (always)
8. Preserved content block (only on overwrite + preservable content exists)

Note: When content is long or sections > 5, detail files are created under `.agents-docs/` and main file uses summaries via `getFirstSentence()` for each section with `detailFile`.

## Section data sources

Feedback Instructions

- Primary: `package.json` scripts (test, format, lint, format:yaml, lint:yaml, build)
- Fallbacks: `analysis.testingFrameworks`, `analysis.languages`, `analysis.buildSystems`
- Detection source: static analysis in `analyzeProject()` + hardcoded defaults in `generateFeedbackContent()`

Project Overview

- Primary: agent discovery prompt `languages` (`DISCOVERY_PROMPTS.languages`)
- Fallback: `analysis.languages`
- Detection source: agent scan + static analysis in `analyzeProject()`

Build System

- Primary: agent discovery prompt `buildSystems`
- Fallback: `analysis.buildSystems`
- Detection source: agent scan + static analysis in `analyzeProject()`

Testing Framework

- Primary: agent discovery prompt `testing`
- Fallback: `analysis.testingFrameworks`
- Detection source: agent scan + static analysis in `analyzeProject()`

Architecture

- Primary: agent discovery prompt `architecture`
- Fallback: `analysis.architecture`
- Detection source: agent scan + static analysis in `analyzeProject()`

Deployment

- Primary: agent discovery prompt `deployment`
- Fallback: none (agent output only; section omitted if response contains "not available")
- Detection source: agent scan

Footer/metadata

- Static strings in `generateCompactContent()`

Preserved content block

- Extracted from existing `AGENTS.md` by `extractPreservableContent()` (headers containing gotcha/learning/note/etc)

## Hardcoded assumptions / defaults

Static analysis in `analyzeProject()`

- Languages:
  - Defaults to TypeScript if `typescript` dependency or `tsconfig.json` exists; else JavaScript.
  - Adds Python/Java/Go/Rust based on file presence.
- Build systems:
  - `npm scripts` if `package.json` has `scripts.build`.
  - Webpack/Vite based on config files.
  - Bun if `bun` dependency present.
  - Poetry/setuptools if `pyproject.toml` exists.
  - Maven/Gradle/Go modules/Cargo based on standard files.
- Testing frameworks:
  - Jest/Vitest/Mocha from deps; Bun Test if `bun` dep present.
- Architecture:
  - `src/ directory structure` if `src/` exists.
  - `Docker Compose`, `Docker containerization`, `GitHub Actions CI/CD` based on files/dirs.

Feedback defaults in `generateFeedbackContent()`

- Unit tests:
  - Prefer `package.json` `scripts.test` if present.
  - Else `jest`, `pytest`, or `bun test` based on detected testing frameworks.
  - Final fallback always `bun test` (hardcoded).
- Code formatting:
  - Prefer `scripts.format` else hardcode Prettier command for JS/TS.
- Code linting:
  - Prefer `scripts.lint` else hardcode `eslint . --fix` for JS/TS.
- YAML formatting/linting:
  - Only if `format:yaml`/`lint:yaml` scripts exist.
- Build:
  - Prefer `scripts.build` else infer from `analysis.buildSystems` and hardcode common commands (bun, npm/yarn, mvn, gradle).

Deployment section inclusion

- Omitted if agent output includes "not available" (case-insensitive check) even if deployment signals exist.

## Baseline notes

- Section order is controlled by `priority` in `createTemplateSections()`.
- Content comes from agent scans when available; static analysis only used as fallback for most sections except Deployment.
- Multiple signals are currently collapsed into single strings; no tagging/aggregation across sources yet.
