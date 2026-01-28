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

## Task Generation

- AI may wrap JSON responses in markdown code blocks (```json)
- Extract JSON using regex pattern: `/```(?:json)?\s*(\[[\s\S]*\])\s*```/`
- Always validate task structure before saving (id, title, description, status, dependencies, acceptance_criteria)
- YAML formatting done manually to ensure consistent indentation and structure

## Agent Subprocess Spawning

- Use child_process.spawn for spawning opencode/claude
- Set stdio: ['pipe', 'pipe', 'pipe'] for full control over streams
- Stream stdout/stderr to console in real-time using process.stdout.write()
- Send prompt to stdin, then call stdin.end() to signal completion
- Handle 'error' event for spawn failures (e.g., command not found)
- Handle 'close' event for exit code (treat null as 1)
- Use 'which' command to check if agent binary exists in PATH
- Avoid testing with real agent spawns (interactive CLIs hang in tests)
- Handle SIGINT/SIGTERM to kill child process on ctrl+c
- Use process.kill(-child.pid) to kill process group (shell + children)
- Clean up signal handlers on exit/error to prevent memory leaks

## Prompt Construction

- Three phases: implement, review, finalize - each with specific instructions
- Include context files: AGENTS.md, tasks-<feature>.yml, progress-<feature>.txt
- All context files optional - gracefully handle missing files
- Feedback and lint commands configurable in config (feedbackCommand, lintCommand)
- Output markers: TASK_COMPLETED: <id> for implement, FINALIZED: <id> for finalize
- Prompts tell agent to update task status, progress file, AGENTS.md, and commit
