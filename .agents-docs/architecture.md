# Architecture

ARCHITECTURE PATTERN: CLI Orchestration with Subprocess Delegation
DIRECTORY STRUCTURE: Flat source directory with modular single-purpose files
DESIGN PATTERNS: Strategy Pattern (agent types), Factory Pattern (prompt construction), Client Abstraction (AgentClient mimics SDK interface)
DATABASE: None - uses YAML files for persistence
API DESIGN: Not applicable - CLI tool with subprocess spawning for agent communication

**Detailed Analysis:**

## Directory Structure

```
hone-ai/
├── src/                    # All TypeScript source files (flat structure)
│   ├── index.ts            # CLI entry point (Commander.js)
│   ├── config.ts           # Configuration management
│   ├── agent.ts            # Agent subprocess spawning
│   ├── agent-client.ts     # Anthropic SDK-compatible client wrapper
│   ├── prd-generator.ts    # PRD generation with interactive Q&A
│   ├── task-generator.ts   # Task list generation from PRDs
│   ├── run.ts              # Task execution orchestration (3-phase loop)
│   ├── prompt.ts           # Prompt construction for agent phases
│   ├── prds.ts             # PRD listing and status utilities
│   ├── status.ts           # Task status tracking
│   ├── agents-md-generator.ts  # AGENTS.md documentation generator
│   ├── errors.ts           # Error handling utilities
│   ├── logger.ts           # Logging with verbose mode
│   └── *.test.ts           # Co-located test files
├── .plans/                 # Project plans directory (YAML task files, PRDs)
└── package.json            # Bun-based build and runtime
```

## Key Architectural Decisions

1. **Subprocess Delegation**: Core pattern - spawns `opencode` or `claude` CLI as subprocess rather than direct API calls. `agent.ts:26-176` handles spawn lifecycle, signal handling, and timeout management.

2. **SDK-Compatible Client Layer**: `AgentClient` (`agent-client.ts:38-157`) mirrors Anthropic SDK's `client.messages.create()` interface but routes through subprocess spawning. Enables future API migration.

3. **Three-Phase Task Execution**: `run.ts:61-236` implements:
   - **Implement**: Task implementation without commits
   - **Review**: Code review of changes
   - **Finalize**: Commit, update tracking files

4. **File-Based State Management**: All state persisted in `.plans/` directory as YAML (tasks) and markdown (PRDs, progress). No database - simple file operations.

5. **Configuration Hierarchy**: Phase-specific model overrides > agent-specific models > defaults (`config.ts:186-205`)

## Notable Patterns

- **Error Classification**: `errors.ts:114-141` parses agent stderr to classify errors (network, rate_limit, model_unavailable, timeout)
- **Retry with Backoff**: Network errors retry with exponential backoff (`errors.ts:146-189`)
- **Prompt Templates**: Phase-specific prompt construction (`prompt.ts`) using file references (`@path/to/file`) for context injection
- **Parallel Discovery**: `agents-md-generator.ts:400-425` runs multiple agent prompts concurrently for project analysis

---

*This file is part of the AGENTS.md documentation system.*
