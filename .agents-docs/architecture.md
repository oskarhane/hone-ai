# Architecture

ARCHITECTURE PATTERN: CLI Orchestration with Subprocess Delegation - A layered orchestrator that accepts CLI commands, spawns AI agent subprocesses (opencode/claude), and manages state via YAML files in `.plans/` directory.

DIRECTORY STRUCTURE:
- **Flat src/**: 15 modules at same level, no subdirectories
- **Co-located tests**: `*.test.ts` adjacent to source files
- **State externalization**: All persistent state in `.plans/` (tasks, PRDs, config, progress)
- **Single entry point**: `src/index.ts` as CLI entry with shebang

DESIGN PATTERNS:
- **Adapter Pattern** (`agent-client.ts`): Mimics Anthropic SDK API but routes through subprocess spawning
- **Strategy Pattern** (`agent.ts`): Different CLI interfaces for opencode vs claude agents
- **Template Method** (`prompt.ts`): Phase-specific prompt construction (implement/review/finalize)
- **State Machine** (`run.ts`): 3-phase task execution: implement → review → finalize
- **Factory-like Resolution** (`config.ts`): Hierarchical model config (phase > agent > default)
- **Module-per-Feature**: Each file handles distinct concern (prd-generator, task-generator, status, etc.)

DATABASE: File-based persistence using YAML (`js-yaml`) for structured data (tasks, config) and Markdown for documents (PRDs, progress logs). Manual YAML serialization for consistent formatting. TypeScript interfaces define data models (Task, TaskFile, HoneConfig, PrdInfo).

API DESIGN: No HTTP API - CLI tool with programmatic internal module exports:
- `generatePRD()`, `generateTasksFromPRD()`, `executeTasks()`, `generateAgentsMd()`
- CLI commands: `hone init|prd|prd-to-tasks|run|prds|status|agents-md`

**Additional Notable Patterns:**

| Concern | Implementation |
|---------|----------------|
| Error handling | Centralized `HoneError` class, classification functions, exponential backoff retry, test-aware exits |
| Logging | Verbosity-controlled via `--verbose`, `[AgentClient]`/`[Agent]` prefixes for debug logs |
| Config | YAML-based with deep merge defaults, auto-initialization, model format validation |
| Runtime | Bun (not Node.js), cross-compiled binaries for Linux/macOS (~57-104MB) |
| Agent control | Structured prompts with output markers (`TASK_COMPLETED:`, `FINALIZED:`) |
| Dependencies | Task graph with cancelled tasks counting as "completed" for resolution |

---

*This file is part of the AGENTS.md documentation system.*
