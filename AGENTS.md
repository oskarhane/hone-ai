# AGENTS.md

Learnings and patterns for future agents working on this project.

## Project Overview

PRIMARY LANGUAGES: TypeScript, YAML, Markdown

See [@.agents/languages.md](.agents/languages.md) for detailed information.

## Build System

**BUILD SYSTEMS:** Bun (primary package manager, bundler, compiler, test runner)

See [@.agents/build.md](.agents/build.md) for detailed information.

## Testing Framework

**TESTING FRAMEWORKS:** Bun Test (native)

See [@.agents/testing.md](.agents/testing.md) for detailed information.

## Architecture

**ARCHITECTURE PATTERN**: Multi-Phase Orchestration with Agent Abstraction

See [@.agents/architecture.md](.agents/architecture.md) for detailed information.

## Deployment

**DEPLOYMENT STRATEGY**: Multi-platform binary distribution with automated release pipeline

See [@.agents/deployment.md](.agents/deployment.md) for detailed information.

---

_This AGENTS.md was generated using agent-based project discovery._
_Detailed information is available in the .agents/ directory._

<!-- PRESERVED CONTENT FROM PREVIOUS VERSION -->

## Phase-Specific Model Configuration

- Config supports optional phase-specific model overrides: `prd`, `prdToTasks`, `implement`, `review`, `finalize`
- Model resolution priority: phase-specific model > agent-specific model > default model
- `resolveModelForPhase(config, phase?, agent?)` resolves correct model for any phase
- Phase-specific models in config.models are optional - system falls back gracefully
- Validation via `validateConfig()` ensures model names follow correct format
- Model version availability depends on agent (check `opencode --help` or `claude --help` for supported versions)
- All phases (implement/review/finalize) pass resolved model to `spawnAgent()`
- PRD generation and task generation use `resolveModelForPhase()` for consistency
