# PRD: Detection-Based, Language-Agnostic AGENTS.md

## Overview

Improve agents-md generation to be language agnostic and detection based, avoiding incorrect assumptions by deriving sections from repo signals and surfacing conflicts explicitly.

## Goals

- Detect all sections (commands, languages, architecture, deployment, etc.) from repo signals.
- Represent conflicting signals by listing multiple entries with short source tags.
- Reduce incorrect assumptions and stale guidance in generated AGENTS.md.

## Non-Goals

- Redesign of AGENTS.md format beyond required conflict representation.
- Changing core agent orchestration behavior.
- Adding new detection sources outside repo and config.

## Requirements

### Functional Requirements

- REQ-F-001: Detect build/test/lint/format/YAML commands from repo signals (e.g., package.json scripts, workflows, docs).
- REQ-F-002: Detect primary languages, build system, testing framework, architecture, deployment from signals; avoid hardcoded assumptions.
- REQ-F-003: When multiple signals exist, include all commands/values in the same section with short source tags.
- REQ-F-004: Ensure agents-md covers all sections currently generated, but content is detection-based.
- REQ-F-005: If a signal is missing, fall back to other sources; do not omit by default if any signal exists.
- REQ-F-006: Source tags must be short and consistent (e.g., `npm test (package.json)`).

### Non-Functional Requirements

- REQ-NF-001: Deterministic output given same repo state.
- REQ-NF-002: Avoid destructive changes; no removal of user-provided content outside generated sections.
- REQ-NF-003: Maintain backward compatibility with existing agents-md consumers.

## Technical Considerations

- Detection priority should aggregate, not override; collect from package.json, config files, .github/workflows, README, .agents-docs, and other repo docs.
- Need robust parsing for scripts, CI commands, and tool configs (eslint/prettier/bun/npm).
- Avoid language assumptions; infer from file extensions and config presence.
- Conflict handling: list multiple commands with source tags; avoid “unknown/omitted” when at least one signal exists.
- Ensure generation logic is unit-testable; add tests for conflict aggregation and tagging.

## Acceptance Criteria

- [ ] Generated AGENTS.md lists multiple commands per section when signals conflict, with short source tags.
- [ ] No hardcoded language/framework assumptions remain in agents-md generation.
- [ ] Primary languages, build system, testing framework, architecture, deployment are detection-based.
- [ ] Tests cover multi-source aggregation and conflict formatting.

## Out of Scope

- Changing AGENTS.md section names.
- New external data sources or telemetry.

## Open Questions

- None.
