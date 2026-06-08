---
description: Generates AGENTS.md project documentation with feedback instructions, architecture, and conventions. Use when starting a new project or updating project docs.
---

Generate AGENTS.md documentation for this project:

1. Check `$ARGUMENTS` for overwrite intent (look for `--overwrite`, `overwrite`, `force`, `regenerate`, etc.).

2. If `AGENTS.md` already exists and overwrite was NOT requested:
   - Report: "AGENTS.md already exists. Use --overwrite to replace."
   - Stop.

3. Analyze the project by reading:
   - The project manifest(s) for dependencies, scripts, name, description — whichever the stack uses:
     - Node: `package.json`
     - Go: `go.mod`
     - Java: `pom.xml`, `build.gradle`(`.kts`)
     - Python: `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile`
     - Rust: `Cargo.toml`
     - or the equivalent manifest for another stack
   - Build/tool config: `tsconfig.json`, `jest.config.*`, `vitest.config.*`, `.eslintrc*`, `tailwind.config.*`, `Makefile`, `ruff.toml`/`tox.ini`, `golangci.yml`, `checkstyle.xml`, etc.
   - Directory structure (`src/`, `lib/`, `test/`, `components/`, `.github/workflows/`)
   - `README.md` for project description
   - Existing `.agents/` directory files if any
   - `.github/workflows/*.yml` for CI/CD info
   - `Dockerfile`, `docker-compose.yml` if present

4. Generate `AGENTS.md` with this structure:

```markdown
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
```

Keep every section terse — high signal, fewer words. State only what an agent
reader needs; drop vanity notes, restated obvious facts, and anything the code or
tooling already makes clear.

5. Discover feedback commands (test, build, lint, format, check, typecheck) from:
   - Manifest scripts/targets: `package.json` scripts (Node), `Makefile` targets, `pyproject.toml`/`tox.ini`/`noxfile.py` (Python), Gradle/Maven tasks (Java), `go test`/`go build`/`go vet` and `golangci-lint` (Go)
   - CI/CD workflow files (commands in `run:` steps)
   - Config files (jest, vitest, eslint, prettier configs indicate available tools)

6. Generate `.agents/` detail files ONLY where there's substantive detail worth a
   separate file. Skip any topic that has no useful info beyond its `AGENTS.md`
   summary — never write a near-empty stub. Create `.agents/` only if at least one
   file is warranted. Candidate files:
   - `.agents/languages.md` - Language stack details
   - `.agents/build.md` - Build system details
   - `.agents/testing.md` - Testing framework details
   - `.agents/architecture.md` - Architecture patterns
   - `.agents/deployment.md` - Deployment strategy

7. If `AGENTS.md` exists and overwrite was requested, regenerate from scratch and
   merge — never blindly preserve the old file:
   - **Capture** custom content first: read the existing `AGENTS.md` and identify
     anything beyond the standard generated sections (Feedback Instructions,
     Project Overview, Build System, Testing Framework, Architecture, Deployment,
     footer) — extra top-level sections (e.g. `## Conventions`) and extra
     notes/bullets folded into standard sections.
   - **Regenerate** all standard sections fresh from the discovery in steps 3–5.
   - **Merge** captured content back, keeping only what's worth it:
     - Drop anything that conflicts with or duplicates the freshly generated info.
     - Drop anything not useful for an agent reader.
     - Compact what remains (high signal, fewer words). Extra standalone sections
       go after Deployment, before the footer; section-specific notes fold
       compactly into the matching standard section.

8. Write `AGENTS.md` to project root.
