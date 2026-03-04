# Project Overview

PRIMARY LANGUAGES: [TypeScript]
USAGE CONTEXT: TypeScript is the sole programming language used in this project. It serves as:
- **CLI Application**: Main entry point (`src/index.ts`) using Commander.js for command-line interface
- **Core Business Logic**: Agent orchestration, PRD generation, task generation, and config management
- **Testing**: All test files use Bun's test runner with `.test.ts` and `.integration.test.ts` patterns
- **Build Target**: Compiled to native binaries via Bun for Linux and macOS platforms

No JavaScript source files exist—this is a pure TypeScript codebase running on the Bun runtime.

---

*This file is part of the AGENTS.md documentation system.*
