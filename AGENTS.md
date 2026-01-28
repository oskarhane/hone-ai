# AGENTS.md

Learnings and patterns for future agents working on xloop.

## CLI Structure

- Using commander.js for CLI parsing
- Entry point: src/index.ts with shebang for direct execution
- All commands follow pattern: xloop <command> [options]
- Auto-initialization: All commands except 'init' auto-create .plans/ and config
- Init command: Explicit initialization with user feedback, idempotent

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

- Next task = first pending task where all dependencies have status 'completed' or 'cancelled'
- Tasks blocked by incomplete deps return null from findNextTask
- Status calculated: not started (0 done), in progress (some done), completed (all done)
- Cancelled tasks count as completed for status calculation and dependency resolution
- Task status can be: 'pending', 'in_progress', 'completed', 'failed', or 'cancelled'

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
- Non-interactive mode: claude uses `-p "prompt"`, opencode uses `run "prompt"`
- CRITICAL: Do NOT use `shell: true` - causes shell to interpret special chars like @
- Set stdio: ['inherit', 'pipe', 'pipe'] - inherit stdin, capture stdout/stderr
- Stream stdout/stderr to console in real-time using process.stdout.write()
- Do NOT write to child.stdin - args contain the prompt for non-interactive mode
- Handle 'error' event for spawn failures (e.g., command not found)
- Handle 'close' event for exit code (treat null as 1)
- Use 'which' command to check if agent binary exists in PATH
- Avoid testing with real agent spawns (interactive CLIs hang in tests)
- Handle SIGINT/SIGTERM to kill child process on ctrl+c
- Use process.kill(-child.pid) to kill process group (shell + children)
- Clean up signal handlers on exit/error to prevent memory leaks

## Prompt Construction

- Three phases: implement, review, finalize - each with specific instructions
- Reference context files using @<file_path> syntax instead of reading content
- File paths MUST be relative to project root (use path.relative(cwd, path))
- File references: @.plans/tasks-<feature>.yml, @.plans/progress-<feature>.txt, @AGENTS.md
- All context files optional - gracefully handle missing files
- Feedback and lint commands configurable in config (feedbackCommand, lintCommand)
- Output markers: TASK_COMPLETED: <id> for implement, FINALIZED: <id> for finalize
- Prompts tell agent to update task status, progress file, AGENTS.md, and commit
- constructPrompt() is synchronous - only checks file existence, doesn't read content
- Git commits ONLY happen in finalize phase - implement phase explicitly forbids commits
- Feedback loops should ONLY run after task implementation complete, not during exploration
- Finalize phase runs feedback loops only if changes made to address review feedback

## Error Handling & Failure Recovery

- When agent exits with non-zero code, execution stops immediately (throw)
- Failed tasks NOT marked as completed - task remains in 'pending' status
- Next run will retry the same task from beginning
- Error messages include: phase that failed, exit code, stderr output
- Implement phase: agent told to NOT output TASK_COMPLETED if tests fail
- Review phase: if fails, finalize never runs so task file never updated
- Finalize phase: more complex - may need manual recovery if partial work done
- Warning displayed if TASK_COMPLETED marker not found in agent output

## Error Module (src/errors.ts)

- XLoopError extends Error with exitCode property for structured errors
- formatError() uses ✗ symbol matching PRD spec for consistent error display
- exitWithError() throws in test mode (NODE_ENV/BUN_ENV=test) to allow testing
- isNetworkError() detects common network errors (ECONNREFUSED, ETIMEDOUT, etc.)
- retryWithBackoff() implements exponential backoff: delay = min(initial * 2^attempt, maxDelay)
- Default retry: 3 attempts, 1s initial delay, 10s max delay
- ErrorMessages object provides structured message/details for common scenarios
- Network retry integrated into prd-generator and task-generator API calls

## Build & Distribution

- Build script in package.json: `bun run build`
- Uses `bun build --compile --minify --sourcemap` to create standalone executable
- Outputs single binary `xloop` (~57MB) that includes Bun runtime and all dependencies
- Binary can be copied to /usr/local/bin or other PATH location for system-wide use
- Build output (xloop, xloop.map) added to .gitignore
- README documents both source installation and binary build process
