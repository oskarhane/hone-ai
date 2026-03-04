# Architecture

ARCHITECTURE PATTERN: CLI orchestration with subprocess delegation and 3-phase implement/review/finalize loop

DIRECTORY STRUCTURE:
- Flat `src/` with single-purpose TypeScript modules (17 modules + 17 test files co-located)
- `.plans/` for PRD files, task YAML, and config (`hone.config.yml`)
- `.agents/` for generated documentation detail files
- No nested folder hierarchy; one file per concern

DESIGN PATTERNS:
- **Command Pattern**: Commander.js CLI with discrete commands (`init`, `prd`, `run`, `status`, `prune`)
- **Client Abstraction**: `AgentClient` mirrors Anthropic SDK API, wraps subprocess spawning
- **Strategy Pattern**: Agent type (`opencode`/`claude`) determines subprocess command and model arg format
- **Template/Builder**: `constructPrompt()` builds phase-specific prompts for implement/review/finalize
- **Atomic Operations**: Temp file + rename for safe writes/moves in prune operations

DATABASE: None - state persisted as YAML (tasks, config) and Markdown (PRDs) in `.plans/`

API DESIGN: Not applicable - pure CLI tool; interactions via:
- Subprocess spawning of `opencode` or `claude` agents
- File-based workflows (read/write YAML and Markdown)
- Signal handling (SIGINT/SIGTERM) for graceful subprocess termination

Key architectural decisions:
1. **Subprocess delegation**: Core work delegated to AI agent CLIs, hone orchestrates
2. **Phase-based execution**: 3-phase loop (implement→review→finalize) per iteration
3. **File-based state**: No database; `.plans/` directory is source of truth
4. **Model flexibility**: Phase-specific model overrides via config
5. **Error classification**: Structured error parsing with retry logic for network errors only
6. **Atomic file ops**: Safe file moves using temp file patterns

---

*This file is part of the AGENTS.md documentation system.*
