---
description: Generate AGENTS.md project documentation with feedback instructions, architecture, and conventions. Use when starting a new project or updating project docs.
---

Generate AGENTS.md documentation for this project:

1. Check `$ARGUMENTS` for overwrite intent (look for `--overwrite`, `overwrite`, `force`, `regenerate`, etc.).

2. If `AGENTS.md` already exists and overwrite was NOT requested:
   - Report: "AGENTS.md already exists. Use --overwrite to replace."
   - Stop.

3. Analyze the project by reading:
   - `package.json` (dependencies, scripts, name, description)
   - `tsconfig.json`, `jest.config.*`, `vitest.config.*`, `.eslintrc*`, `tailwind.config.*` etc.
   - Directory structure (`src/`, `lib/`, `test/`, `components/`, `.github/workflows/`)
   - `README.md` for project description
   - Existing `.agents/` directory files if any
   - `.github/workflows/*.yml` for CI/CD info
   - `Dockerfile`, `docker-compose.yml` if present

4. Generate `AGENTS.md` with this structure:

```markdown
<!-- BEGIN GENERATED: AGENTS-MD -->

# AGENTS.md

Learnings and patterns for future agents working on this project.

## Feedback Instructions

TEST COMMANDS: [<discovered test commands>]
BUILD COMMANDS: [<discovered build commands>]
LINT COMMANDS: [<discovered lint commands>]
FORMAT COMMANDS: [<discovered format commands>]

## Project Overview

PRIMARY LANGUAGES: [<languages>]

<brief description>

## Build System

BUILD SYSTEMS: [<build tools>]

<details>

## Testing Framework

TESTING FRAMEWORKS: [<test runners>]

<details>

## Architecture

ARCHITECTURE PATTERN: <pattern description>

<details>

## Deployment

DEPLOYMENT STRATEGY: <strategy>

<details>

---

_This AGENTS.md was generated using agent-based project discovery._

<!-- END GENERATED: AGENTS-MD -->
```

5. Discover feedback commands from:
   - `package.json` scripts (test, build, lint, format, check, typecheck)
   - CI/CD workflow files (commands in `run:` steps)
   - Config files (jest, vitest, eslint, prettier configs indicate available tools)

6. Create `.agents/` directory if it doesn't exist, and generate detail files:
   - `.agents/languages.md` - Language stack details
   - `.agents/build.md` - Build system details
   - `.agents/testing.md` - Testing framework details
   - `.agents/architecture.md` - Architecture patterns
   - `.agents/deployment.md` - Deployment strategy

7. If `AGENTS.md` exists and overwrite was requested:
   - Preserve any content OUTSIDE the `<!-- BEGIN GENERATED -->` / `<!-- END GENERATED -->` markers
   - Only replace content between the markers

8. Write `AGENTS.md` to project root.
