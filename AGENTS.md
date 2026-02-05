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

_This AGENTS.md was generated using agent-based project discovery._
_Detailed information is available in the .agents-docs/ directory._

<!-- PRESERVED CONTENT FROM PREVIOUS VERSION -->

## Phase-Specific Model Configuration

- Config supports optional phase-specific model overrides: `prd`, `prdToTasks`, `extendPrd`, `implement`, `review`, `finalize`
- Model resolution priority: phase-specific model > agent-specific model > default model
- `resolveModelForPhase(config, phase?, agent?)` resolves correct model for any phase
- Phase-specific models in config.models are optional - system falls back gracefully
- Validation via `validateConfig()` ensures model names follow correct format
- Model version availability depends on agent (check `opencode --help` or `claude --help` for supported versions)
- All phases (implement/review/finalize) pass resolved model to `spawnAgent()`
- PRD generation and task generation use `resolveModelForPhase()` for consistency
- Adding new phases: update ModelPhase type, phases validation array, and add fallback logic if needed

## CLI Command Implementation

- Use Commander.js patterns consistent with existing commands in src/index.ts
- Import style should be `import { readFile, writeFile } from 'fs/promises'` not `import { promises as fs } from 'fs'`
- Implement comprehensive input validation with clear error messages before core logic
- Use placeholder implementations with TODO comments for incremental development

## Testing Patterns

- Test files must import modules with `.js` extension (e.g., `from './extend-prd.js'`) for Bun compatibility
- Use specific line number assertions carefully - content changes can break tests
- Remove unused imports/constants when identified in code review to maintain clean codebase

## YAML File Parsing

- Use `yaml` package for robust YAML parsing with proper error handling
- Implement validation for required fields early in parsing process
- ID extraction patterns: task IDs follow `task-###` format, requirement IDs use `REQ-F-###` or `REQ-NF-###`
- Sequential ID generation should find highest existing ID and increment by 1 to avoid collisions
- Pure parsing functions that don't mutate original data structures are preferred

## Interactive Q&A Implementation

- Avoid duplicate config loading - pass config/model as parameters to Q&A functions
- Don't reference tools in system prompts unless AgentClient actually has tool access
- Use readline interface for user interaction with graceful interruption handling ("done")
- Read AGENTS.md for project context to improve AI question generation
- Progress indicators improve UX during AI processing time

## Regex Pattern Implementation

- Complex regex patterns for content detection need careful testing to avoid overlapping matches
- Use combined regex with text position tracking to preserve order rather than sequential pattern application
- Export functions used by tests to prevent import errors during development
- Home directory (`~`) expansion must be implemented manually using `process.env.HOME`
- Test all regex edge cases including file extensions, relative paths, and spurious absolute path detection

## AI Response Parsing

- Document AI response format expectations in comments for maintainability
- Use clear section markers (e.g. "FUNCTIONAL REQUIREMENTS:") for reliable parsing
- Implement robust parsing that handles variations in AI response format
- Track in-memory state mutations with clear documentation (e.g. `lineNumber: -1` pattern)
- Consider extracting parsing logic into separate testable functions for complex AI responses
