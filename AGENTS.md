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
- Verify import usage before flagging as unused - `mock` import is used via `mock.module()` calls
- Comprehensive mocking of external dependencies isolates unit tests effectively
- Integration tests that change `process.cwd()` acceptable for sequential tests but note potential race conditions
- Network-dependent integration tests (e.g. `example.com` requests) may cause flaky tests - consider mocking
- **Mock State Leakage**: `mock.module()` calls persist across test files in same process - causes conflicts between unit and integration tests
- **Integration Test Solution**: Convert integration tests to use CLI commands instead of direct function calls to avoid mock conflicts
- CLI-based integration tests spawn fresh processes unaffected by in-process mocks and provide true end-to-end validation
- **Unit Test Alternative**: When full CLI tests aren't needed, replace complex mocked agent calls with direct unit tests of parsing logic to avoid mock conflicts
- **Parsing Logic Testing**: Use exact equality matching (`line.trim() === 'FUNCTIONAL REQUIREMENTS:'`) instead of substring matching for reliable section header detection
- **Test Description Visibility**: Include test case descriptions in assertion messages using `expect(value, description)` pattern for better debugging when parameterized tests fail
- Export metadata signal helpers with `@internal` when adding focused unit tests
- **Unknown Provider Testing**: When adding multi-provider regex validation, include test for unknown/unsupported provider prefixes to verify rejection (e.g., `mistral/mixtral-8x7b` when only `openai|anthropic|google` supported)
- **Backward Compatibility Testing**: When extending validation patterns, add dedicated test suite verifying existing configs remain valid - prevents breaking changes

## YAML File Parsing

- Use `yaml` package for robust YAML parsing with proper error handling
- Implement validation for required fields early in parsing process
- ID extraction patterns: task IDs follow `task-###` format, requirement IDs use `REQ-F-###` or `REQ-NF-###`
- Sequential ID generation should find highest existing ID and increment by 1 to avoid collisions
- Pure parsing functions that don't mutate original data structures are preferred
- Use straight quotes in YAML strings to avoid parser quirks with curly quotes

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
- Filename derivation regex: use capturing groups like `/^prd-(.+)\.md$/` for extracting feature names
- Validate regex patterns against edge cases: empty captures, missing extensions, special characters
- Multi-provider model validation: use alternation pattern with provider prefix (`provider/model`) OR legacy format (`claude-opus-\d+-\d{8}`)
- Character class `[\w.-]+` covers standard model naming (letters, numbers, dots, hyphens, underscores)
- Full string anchors (`^...$`) prevent partial matches in validation regex
- Error messages must accurately reflect regex patterns - use generic placeholders (e.g., "N") for variable components (\d+) rather than specific versions

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
- Task count tracking: capture initial count before generation, return only incremental additions
- Remove unused variables even when they seem related to task (e.g. originalRequirementCount)

## Atomic File Operations

- Use temp file + rename pattern for atomic writes on POSIX systems
- Remove unused rollback tracking arrays if individual functions handle atomicity internally
- AtomicTransaction class provides coordination for multiple file operations
- Cleanup temp files properly in error conditions - avoid using fs.unlink, prefer fs.rm with recursive option
- Two-phase atomic rename: source→temp, then temp→target for safe file moves
- Error recovery should attempt to restore original file if temp file exists after failed operation

## Error Handling and Validation

- Use HoneError class and formatError utility for consistent error messaging patterns
- Add path traversal protection using path.resolve and containment checks for security
- Network operations need retry with exponential backoff (3 retries, bounded delays)
- Input validation should catch empty strings, wrong file extensions, invalid formats early
- Avoid dynamic imports when module already imported at top level - add to existing import statement
- File system error codes (ENOENT, EACCES, EISDIR, etc.) handled with specific user-friendly messages
- Graceful degradation for non-critical errors (warnings don't fail operations)
- Multi-file atomic operations: files that complete stage 2 (temp→target) before error are intentionally left in final location as they're in valid state
- Avoid double error wrapping: check `error instanceof HoneError` before wrapping to prevent nested error messages

## Documentation Patterns

- Integrate new command documentation into existing README structure using established patterns
- CLI help descriptions should be concise while README provides comprehensive details
- Include troubleshooting sections for common error scenarios and user issues
- Document phase-specific configuration options with clear examples
- Add usage examples demonstrating real workflow scenarios rather than abstract syntax
- Doc glob examples should use literal patterns (e.g., `**/*.yml`) without escaping

## Logic in hone-ai vs underlying agents

- hone-ai handles high-level orchestration and coordination of agent interactions
- Underlying agents execute specific tasks and provide atomicity guarantees
- hone-ai manages retries, error handling, and coordination across agents
- Underlying agents focus on individual task execution and atomicity
- Underlying agents can be instructed to fetch data from external sources and to read local files
- Underlying agents can be instructed to write data to local files and to execute shell commands

## Content Fetching Delegation

- Delegate file/URL content fetching to underlying agents rather than local implementation
- Agents handle network timeouts, retries, and content access using built-in tools
- Local content fetching removal preserves interfaces until complete refactor is done
- Empty contentContext with explanatory comments maintains code structure during transition
- Interface removal requires updating all function signatures that used the interface as parameters
- JSDoc comments must be updated when parameter signatures change to avoid stale documentation
- System prompts must explicitly instruct agents to fetch content: "automatically detect and read file paths using file reading tools" and "fetch URLs using web fetching tools"

## Code Reuse and Type Annotations

- Remove explicit type annotations on filter/map callbacks when TypeScript can infer types from context
- Reuse existing functions like `listPrds()` and `calculateStatus()` for consistency rather than reimplementing logic
- Create interface types (e.g., `PrdTriplet`) to encapsulate related data structures for better type safety

## Error Output Consistency

- Use consistent error prefixes across CLI commands (e.g., ✗ symbol for all error types)
- HoneError messages should use same formatting as other error types for unified UX
- Avoid variable shadowing in scoped blocks - remove redundant declarations that re-declare outer scope variables
- Use explicit permission flags with fs.access() for clarity: `access(path, constants.R_OK)` instead of default existence check

## Documentation Consistency Patterns

- Use consistent placeholder naming across file structure examples (`<feature>` not mix of `<feature>` and `<completed>`)
- Review feedback on documentation should address naming consistency and clarity
- Integration tests can have mock conflicts with unit tests - use CLI-based integration tests to avoid in-process mock state

## Test Type Safety and Consistency

- Use type-only imports for interfaces when `verbatimModuleSyntax` is enabled: `import type { Type } from './module.js'`
- Replace `any[]` with proper typed arrays (e.g., `PrdRequirement[]`, `Task[]`) for better type safety in tests
- Export functions for testing with `@internal` JSDoc annotation to document testing-only purpose
- Test titles must match test behavior - check assertion expectations align with test descriptions
- Comprehensive test cleanup: tests using temp files should use proper cleanup patterns like `rollbackAtomicWrite()`

## Command Detection

- Inferred commands should use a distinct source type (e.g., `analysis`) to distinguish from config file hits
- Inline markdown command extraction should skip code block content to avoid double counting

## Mock Implementation and Test Performance

- Enhanced mock implementations that cover more function signatures can actually fix pre-existing test failures
- Mock module improvements often have beneficial side effects across test suites due to shared module state
- When validating test suite performance, comprehensive mocks prevent failures that would otherwise require more complex testing approaches
- Mock completeness should be balanced - implement functions that are actually called to prevent missing function errors

## Agent Response Parsing for Error Handling

- When delegating content fetching to agents, parse agent responses for access issues instead of catching local errors
- Use regex patterns to detect agent content access failures: `/(?:could not access|not found|inaccessible)[^\n.]*/gi`
- Apply deduplication with `[...new Set(issues)]` to prevent duplicate error reporting from overlapping patterns
- Agent-based error handling maintains same UX while delegating content access responsibility

## Multi-Provider Model Validation

- Error messages should accurately reflect regex patterns - if regex accepts variable digits (\d+), message should say "N" not specific version like "4"
- Multi-provider regex pattern: /^(?:(?:provider)\/[\w.-]+|claude-(sonnet|opus)-\d+-\d{8})$/ supports both provider-prefixed and legacy formats
- Invalid model strings in `.plans/hone.config.yml` cause integration regex failures - keep config aligned with validation pattern
- Review feedback on error message consistency improves user experience even if low priority
- Test suite validation after feedback application ensures no regressions from minor wording changes
- Phase-specific OpenAI model tests: verify all 7 phases (prd, prdToTasks, implement, review, finalize, agentsMd, extendPrd) accept provider-prefixed models
- Test both agent-specific and phase-specific OpenAI model overrides to ensure proper priority resolution

## Agent Model Argument Construction

- When passing models to agents (opencode/claude), conditionally prepend provider prefix based on model format
- Provider-prefixed models (openai/gpt-4o, anthropic/claude-sonnet) pass through unchanged to agent
- Legacy Claude models (claude-sonnet-4-20250514) need 'anthropic/' prepended for opencode agent
- Use `model.includes('/')` to detect provider-prefixed models
- Extract model arg construction into testable function with @internal annotation
- Only opencode agent needs provider prefix transformation, claude agent passes model as-is
