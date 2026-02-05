# Project Overview

PRIMARY LANGUAGES: [TypeScript]
USAGE CONTEXT:
- **TypeScript**: The entire codebase is written in TypeScript (28 `.ts` files in `src/`). No JavaScript files exist. TypeScript is used for:
  - CLI application logic (`index.ts`, `run.ts`)
  - AI agent orchestration (`agent.ts`, `agent-client.ts`)
  - PRD and task generation (`prd-generator.ts`, `task-generator.ts`)
  - Configuration management (`config.ts`)
  - Unit and integration tests (`*.test.ts`, `*.integration.test.ts`)
  
The project uses Bun as its runtime/bundler with strict TypeScript settings (`strict: true`). It compiles to native binaries for Linux and macOS distribution.

---

*This file is part of the AGENTS.md documentation system.*
