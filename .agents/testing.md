# Testing Framework

TESTING FRAMEWORKS: [Bun test runner (bun:test)]
TEST COMMANDS: [`bun test` - runs all tests, `bun run tsc --noEmit` - type checking]
TEST ORGANIZATION:
- Test files colocated with source files in `src/` directory
- Naming convention: `*.test.ts` for unit tests, `*.integration.test.ts` for integration tests
- 18 test files total (mix of unit and integration tests)
- Tests use `describe`/`test`/`expect` from `bun:test`
- Integration tests use CLI spawning via `spawnSync('bun', [CLI_PATH, ...args])`
- Setup/teardown via `beforeEach`/`afterEach`/`beforeAll`/`afterAll` hooks
- Test isolation via temp directories (`test-workspace`, `test-cli-integration`)
- Mock patterns: `mock.module()` for mocking dependencies, env var manipulation for test mode

E2E TESTING: Integration tests spawn actual CLI commands via `spawnSync` against temp directories, providing end-to-end validation of CLI behavior without external network dependencies

---

*This file is part of the AGENTS.md documentation system.*
