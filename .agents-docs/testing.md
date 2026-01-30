# Testing Framework

TESTING FRAMEWORKS: [Bun's built-in test runner (bun:test)]
TEST COMMANDS: `bun test` (runs all *.test.ts files)
TEST ORGANIZATION: 
- Co-located tests: test files (*.test.ts) sit next to source files in src/
- Unit tests: named `<module>.test.ts` (e.g., `agent.test.ts`, `config.test.ts`)
- Integration tests: named `<module>.integration.test.ts` (e.g., `index.integration.test.ts`, `agent-client.integration.test.ts`)
- Test structure: uses describe/test/expect from `bun:test`
- Environment handling: BUN_ENV=test for test mode, beforeAll/afterAll for setup/cleanup
- CLI testing: spawns actual CLI via `spawnSync('bun', [CLI_PATH, ...args])` with test directory isolation

E2E TESTING: Integration tests spawn the actual CLI binary against isolated test directories (`test-cli-integration/`), testing real command execution with mocked PRD/task files. No separate E2E framework (Playwright/Cypress) - CLI nature makes integration tests sufficient.

---

*This file is part of the AGENTS.md documentation system.*
