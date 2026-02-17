# Testing Framework

TESTING FRAMEWORKS: [Bun's built-in test runner (bun:test)]

TEST COMMANDS:

- Run all tests: `npm run test` or `bun test`
- Run specific test file: `bun test src/config.test.ts`

TEST ORGANIZATION:

- Tests colocated with source files in `src/` directory
- Naming convention: `*.test.ts` for unit tests
- Naming convention: `*.integration.test.ts` for integration tests
- Uses describe/test/expect pattern from bun:test
- Lifecycle hooks: beforeAll, afterAll, beforeEach, afterEach
- Test workspace isolation pattern (create/cleanup temp directories)

E2E TESTING: No dedicated E2E framework. Integration tests exist for agent-client and index modules but require actual agent binaries (opencode/claude) to be installed. Integration tests verify API surfaces and subprocess spawning behavior.

NOTABLE PATTERNS:

- Environment isolation via `process.env.BUN_ENV = 'test'`
- Filesystem cleanup in beforeEach/afterEach for isolated test runs
- Type-safe test assertions matching TypeScript interfaces
- Manual/CI testing noted for subprocess-dependent functionality

---

_This file is part of the AGENTS.md documentation system._
