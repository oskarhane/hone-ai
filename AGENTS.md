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
- Remove unused imports from bun:test (e.g. `mock`) when not used in test implementation
- Integration tests that change `process.cwd()` acceptable for sequential tests but note potential race conditions
- Network-dependent integration tests (e.g. `example.com` requests) may cause flaky tests - consider mocking

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

## Task Generation and ID Management

- Avoid mutating shared state objects during validation loops - use local counters instead
- Task ID adjustment logic must handle all tasks sequentially, not just first task
- Sequential ID generation: `task-${String(startId + index).padStart(3, '0')}`
- Update ID counters only after all validation/processing is complete
- Remove unused function parameters identified during code review

## Atomic File Operations

- Use temp file + rename pattern for atomic writes on POSIX systems
- Remove unused rollback tracking arrays if individual functions handle atomicity internally
- AtomicTransaction class provides coordination for multiple file operations
- Cleanup temp files properly in error conditions - avoid using fs.unlink, prefer fs.rm with recursive option

## Error Handling and Validation

- Use HoneError class and formatError utility for consistent error messaging patterns
- Add path traversal protection using path.resolve and containment checks for security
- Network operations need retry with exponential backoff (3 retries, bounded delays)
- Input validation should catch empty strings, wrong file extensions, invalid formats early
- Avoid dynamic imports when module already imported at top level - add to existing import statement
- File system error codes (ENOENT, EACCES, EISDIR, etc.) handled with specific user-friendly messages
- Graceful degradation for non-critical errors (warnings don't fail operations)

## Documentation Patterns

- Integrate new command documentation into existing README structure using established patterns
- CLI help descriptions should be concise while README provides comprehensive details
- Include troubleshooting sections for common error scenarios and user issues
- Document phase-specific configuration options with clear examples
- Add usage examples demonstrating real workflow scenarios rather than abstract syntax

## Logic in hone-ai vs underlying agents

- hone-ai handles high-level orchestration and coordination of agent interactions
- Underlying agents execute specific tasks and provide atomicity guarantees
- hone-ai manages retries, error handling, and coordination across agents
- Underlying agents focus on individual task execution and atomicity
- Underlying agents can be instructed to fetch data from external sources and to read local files
- Underlying agents can be instructed to write data to local files and to execute shell commands
