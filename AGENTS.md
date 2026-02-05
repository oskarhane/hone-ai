# AGENTS.md

Learnings and patterns for future agents working on this project.

## Feedback Instructions

Run these commands to validate your changes before committing:

**Unit Tests:** `npm run test` or `bun test`

**Code Formatting:** `npm run format` or `prettier --write "**/*.ts"`

**Code Linting:** `eslint . --fix`

**YAML Formatting:** `npm run format:yaml` or `prettier --write "**/*.yml" "**/*.yaml"`

**YAML Linting:** `npm run lint:yaml` or `yamllint -c .yamllint.yml **/*.yml **/*.yaml`

**Build:** `npm run build` or `bun run build:linux && bun run build:macos`

These commands are project-specific based on the configured scripts and tooling.

## Project Overview

PRIMARY LANGUAGES: [TypeScript]

See [@.agents-docs/languages.md](.agents-docs/languages.md) for detailed information.

## Build System

BUILD SYSTEMS: [Bun]

See [@.agents-docs/build.md](.agents-docs/build.md) for detailed information.

## Testing Framework

TESTING FRAMEWORKS: [Bun's built-in test runner (bun:test)]

See [@.agents-docs/testing.md](.agents-docs/testing.md) for detailed information.

## Architecture

ARCHITECTURE PATTERN: CLI Orchestration with Subprocess Delegation

See [@.agents-docs/architecture.md](.agents-docs/architecture.md) for detailed information.

## Deployment

DEPLOYMENT STRATEGY: CLI binary distribution + NPM package registry

See [@.agents-docs/deployment.md](.agents-docs/deployment.md) for detailed information.

---

*This AGENTS.md was generated using agent-based project discovery.*
*Detailed information is available in the .agents-docs/ directory.*


<!-- PRESERVED CONTENT FROM PREVIOUS VERSION -->
## Phase-Specific Model Configuration

- Config supports optional phase-specific model overrides: `prd`, `prdToTasks`, `implement`, `review`, `finalize`
- Model resolution priority: phase-specific model > agent-specific model > default model
- `resolveModelForPhase(config, phase?, agent?)` resolves correct model for any phase
- Phase-specific models in config.models are optional - system falls back gracefully
- Validation via `validateConfig()` ensures model names follow correct format
- Model version availability depends on agent (check `opencode --help` or `claude --help` for supported versions)
- All phases (implement/review/finalize) pass resolved model to `spawnAgent()`
- PRD generation and task generation use `resolveModelForPhase()` for consistency