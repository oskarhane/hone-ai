# Architecture

ARCHITECTURE PATTERN: CLI orchestration with subprocess delegation (3-phase implement/review/finalize loop)
DIRECTORY STRUCTURE: Flat `src/` with single-purpose modules; `.plans/` holds PRDs/tasks/progress; tests co-located in `src/`; `.agents-docs/` for generated docs
DESIGN PATTERNS: Strategy (agent type), client abstraction (AgentClient mirrors SDK), prompt builder/templates, command-style CLI via Commander
DATABASE: None; state persisted as YAML/Markdown in `.plans/`
API DESIGN: Not applicable; CLI commands drive subprocess agents and file-based workflows

- Code organization: modular TS files (`agent`, `run`, `prompt`, `config`, `errors`, `prds`, `status`), minimal shared utilities
- Config management: `.plans/hone.config.yml` with phase overrides; defaults + validation in `src/config.ts`
- Dependency injection: none; config passed explicitly, globals avoided except logger verbosity
- Error handling: centralized `src/errors.ts`, HoneError + formatted exits, error classification + retry/backoff
- Logging/monitoring: verbose mode via `src/logger.ts`, stdout/stderr streaming from agents; no metrics/tracing
- Security: path traversal checks + permission validation in archive ops; model format validation; no auth/secret handling in code
- Performance: subprocess streaming, timeouts, bounded retries; file I/O is small and mostly direct
- Middleware/interceptors: none
- DB schema/ORM: none

---

*This file is part of the AGENTS.md documentation system.*
