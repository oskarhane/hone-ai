# PRD: Agent-Specific Model Configuration (Config v2)

## Overview

Restructure `hone.config.yml` to support per-agent model configs instead of a flat shared `models` map. Each agent (`claude`, `opencode`) gets its own `models` block with per-phase overrides. A `version` field (starting at `2`) enables schema detection and auto-migration.

## Goals

- Let users tune models independently per agent (e.g., opus for opencode's review phase, sonnet for claude's implement phase)
- Users can also define a default model per agent, named "model".
- Remove ambiguity of shared phase keys that silently applied to whichever agent ran
- Establish a versioned config schema to support future migrations cleanly
- Auto-migrate v1 configs transparently on any command

## Non-Goals

- UI or interactive migration wizard
- Multi-version config rollback
- Changing which phases exist (`ModelPhase` enum stays the same)
- Changing agent types (still `claude` | `opencode`)

## Requirements

### Functional Requirements

- **REQ-F-001**: Config v2 schema — top-level `version: 2`, `agent: <default-agent>`, and agent-specific blocks `claude: { models: { <phase>: <model> } }` and `opencode: { models: { <phase>: <model> } }`
- **REQ-F-002**: `loadConfig()` detects v1 (no `version` field) and auto-migrates to v2 in memory, then writes the migrated file to disk
- **REQ-F-003**: Migration rules from v1 → v2:
- `defaultAgent` → `agent`
- `models.claude` (the default model string) → `claude.model` as the resolved phase fallback (stored but resolution falls through to hardcoded default if absent)
- `models.opencode` (the default model string) → `opencode.model` similarly
- Any v1 phase keys (`prd`, `implement`, `review`, `finalize`, `prdToTasks`, `agentsMd`, `extendPrd`) are copied **only into the `defaultAgent`'s `models` block** (v1 phases were agent-agnostic, so we preserve them for the agent the user was running)
- `lintCommand`, `agentsDocsDir` carry over unchanged
- **REQ-F-004**: `resolveModelForPhase(config, phase, agent)` updated to look up `config[agent].models[phase]`, falling back to the hardcoded default (`claude-sonnet-4-6` for claude, `anthropic/claude-sonnet-4-6` for opencode)
- **REQ-F-005**: Default v2 config written for new projects has empty phase-specific models; just `claude: { models: {} }`, `opencode: { models: {} }` plus hardcoded defaults applied at resolution time
- **REQ-F-006**: `validateConfig()` updated to validate models inside each agent block using the existing regex
- **REQ-F-007**: `initProject()` writes v2 config for new projects
- **REQ-F-008**: `saveConfig()` always writes v2 format
- **REQ-F-009**: Migration is idempotent — running any command multiple times on a v1 config produces the same v2 output

### Non-Functional Requirements

- **REQ-NF-001**: Migration is transparent — no user interaction required, no breaking failures
- **REQ-NF-002**: All existing tests remain passing after changes; new tests cover migration and v2 resolution
- **REQ-NF-003**: YAML output remains human-readable with logical grouping by agent

## Technical Considerations

### New Config Schema (v2)

```yaml
version: 2
agent: claude
claude:
  model: sonnet
  models:
    prd: claude-sonnet-4-6
    implement: claude-opus-4-6
    review: claude-opus-4-6
opencode:
  model: anthropic/claude-sonnet-4-5
  models:
    prd: anthropic/claude-sonnet-4-6
    implement: anthropic/claude-opus-4-6
lintCommand: bun run lint
agentsDocsDir: .agents/
```

### Example migration of `.plans/hone.config.yml`

Current v1:

```yaml
defaultAgent: openode
models:
  opencode: anthropic/claude-opus-4-5
  claude: claude-sonnet-4-6
  review: anthropic/claude-opus-4-5
  agentsMd: anthropic/claude-opus-4-5
```

Migrated v2 (phase overrides go only into `claude` block since `defaultAgent: claude`):

```yaml
version: 2
agent: claude
claude:
  model: claude-sonnet-4-6
  models:
opencode:
  model: anthropic/claude-sonnet-4-5
  models:
    review: anthropic/claude-opus-4-5
    agentsMd: anthropic/claude-opus-4-5
```

Note: `models.claude` and `models.opencode` (bare default model strings) are put into `model` fields.

### Updated `HoneConfig` Interface

```typescript
export interface AgentModelConfig {
  model?: string
  models?: Partial<Record<ModelPhase, string>>
}

export interface HoneConfig {
  version: 2
  agent: AgentType // replaces defaultAgent
  claude: AgentModelConfig
  opencode: AgentModelConfig
  lintCommand?: string
  agentsDocsDir?: string
}
```

### Migration from v1

Detect v1 by absence of `version` field. Migration logic in a dedicated `migrateV1ToV2(v1: LegacyConfig): HoneConfig` function:

```typescript
interface LegacyConfig {
  defaultAgent?: AgentType
  models?: {
    claude?: string
    opencode?: string
    prd?: string
    prdToTasks?: string
    implement?: string
    review?: string
    finalize?: string
    agentsMd?: string
    extendPrd?: string
  }
  lintCommand?: string
  agentsDocsDir?: string
}
```

Phase keys from v1 `models` are copied only into the `defaultAgent`'s block. The non-phase agent-default strings (`models.claude`, `models.opencode`) are discarded — the hardcoded defaults take over.

### Resolution Fallback Chain (updated)

```
phase-specific model (config[agent].models[phase])
  → hardcoded default for agent
      claude   → 'claude-sonnet-4-6'
      opencode → 'anthropic/claude-sonnet-4-6'
```

No global phase key lookup; the entire shared-phase concept is removed.

### `resolveModelForPhase` Signature

Signature stays the same; internal lookup changes to `config[resolvedAgent].models[phase]`.

### Callers to update

All callers of `resolveModelForPhase` pass `config` — no signature changes needed. `loadConfig` returns the migrated v2 config, so callers get v2 data automatically.

## Acceptance Criteria

- [ ] `hone.config.yml` written by `initProject` uses v2 schema with `version: 2` and `agent:` key
- [ ] Loading a v1 config auto-migrates and overwrites the file with v2 format
- [ ] `resolveModelForPhase` returns correct model per-agent from v2 nested structure
- [ ] When no phase model set for an agent, falls back to hardcoded default (`claude-sonnet-4-6` / `anthropic/claude-sonnet-4-6`)
- [ ] `validateConfig` reports errors for invalid models in agent-specific blocks
- [ ] `bun test` passes with no regressions
- [ ] `bun run tsc --noEmit` clean
- [ ] Existing v1 phase keys (`review`, `agentsMd`, etc.) are preserved in only the `defaultAgent`'s block after migration
- [ ] Running migration twice produces identical output (idempotent)
- [ ] `.plans/hone.config.yml` in the repo is updated to v2 format

## Out of Scope

- Supporting >2 agents
- Per-agent `defaultModel` top-level field (defaults are hardcoded constants)
- CLI commands to set per-agent models interactively
- Config version > 2

## Open Questions

None — all questions resolved.
