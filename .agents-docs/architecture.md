# Architecture

ARCHITECTURE PATTERN: CLI orchestration with subprocess delegation and a 3‑phase implement/review/finalize loop.  
DIRECTORY STRUCTURE: Flat `src/` of single‑purpose modules; `.plans/` for PRD/tasks/progress; `.agents-docs/` for generated docs; tests co‑located in `src/`.  
DESIGN PATTERNS: Command-style CLI (Commander), client abstraction (AgentClient), strategy via agent type, prompt builder/templates, atomic file ops for writes/moves.  
DATABASE: None; state persisted as YAML/Markdown in `.plans/`.  
API DESIGN: Not applicable; CLI commands drive subprocess agents and file-based workflows.

- Code organization: TypeScript modules for config, agent spawning, prompts, PRD/task generation, status, pruning, logging, errors (`src/*.ts`).  
- Config management: `.plans/hone.config.yml` with defaults + validation + phase overrides (`src/config.ts`).  
- Dependency injection: None; config passed explicitly; logger uses module-level verbosity flag.  
- Error handling: Centralized `HoneError`, formatted exits, classification + retry/backoff for network (`src/errors.ts`, `src/agent-client.ts`).  
- Logging/monitoring: Verbose toggle + stdout/stderr passthrough; no metrics/tracing (`src/logger.ts`).  
- Security patterns: Path traversal checks + permission validation for archive ops; model format validation (`src/prune.ts`, `src/config.ts`).  
- Performance considerations: Subprocess streaming, timeouts, bounded retries; mostly small file I/O.  
- Middleware/interceptors: None; direct module calls and CLI orchestration.  
- API endpoints: None; interactions via CLI and agent subprocesses.

---

*This file is part of the AGENTS.md documentation system.*
