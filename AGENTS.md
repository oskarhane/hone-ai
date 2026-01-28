# AGENTS.md

Learnings and patterns for future agents working on xloop.

## CLI Structure

- Using commander.js for CLI parsing
- Entry point: src/index.ts with shebang for direct execution
- All commands follow pattern: xloop <command> [options]

## Dependencies

- Bun runtime (not Node.js)
- commander.js for CLI
- js-yaml for task file parsing
- ai SDK with @anthropic-ai/sdk for AI operations

## Project Structure

- `.plans/` directory at project root stores all xloop state
- Task files: `.plans/tasks-<feature>.yml`
- PRD files: `.plans/prd-<feature>.md`
- Progress logs: `.plans/progress-<feature>.txt`
- Config: `.plans/xloop.config.json`
- Tests: add unit tests in x.test.ts files next to the source file being tested

## Task Dependency Logic

- Next task = first pending task where all dependencies have status 'completed'
- Tasks blocked by incomplete deps return null from findNextTask
- Status calculated: not started (0 done), in progress (some done), completed (all done)

## Anthropic API

- Model names must use full version format: `claude-sonnet-4-YYYYMMDD` (e.g., `claude-sonnet-4-20250514`)
- Short names like `claude-sonnet-4` return 404 errors
- Model config in `.plans/xloop.config.json` should always use full version names
- When updating API calls, ensure both default config and fallback values use correct format
