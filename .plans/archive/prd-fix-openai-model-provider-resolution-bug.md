I'll create a comprehensive PRD for fixing the OpenAI model provider resolution issue. Let me first explore the codebase to understand the current model configuration and provider resolution logic.
Now I'll generate the complete PRD based on this analysis:

# PRD: Fix OpenAI Model Provider Resolution Bug

## Overview
Fix the model provider resolution bug in hone-ai where specifying OpenAI models (e.g., `openai/gpt-5.3-codex`) in `.plans/hone.config.yml` fails validation with "provider id still is anthropic" despite the orchestration architecture supporting multiple providers through underlying agents.

## Goals
- Enable users to configure OpenAI models in hone.config.yml without validation errors
- Maintain backward compatibility with existing Claude model configurations
- Allow hone-ai to pass OpenAI model names through to OpenCode without provider interference
- Align validation logic with the multi-provider architecture already present in the agent spawning system

## Non-Goals
- Adding new model provider integrations beyond what OpenCode already supports
- Modifying the agent spawning logic or provider prefix handling in `spawnAgent()`
- Changing the model resolution priority or `resolveModelForPhase()` logic
- Adding intelligent model-to-provider mapping or automatic provider detection

## Requirements

### Functional Requirements
- REQ-F-002: Configuration validation must accept provider-prefixed models (e.g., `openai/gpt-4o`, `anthropic/claude-sonnet-4`)
- REQ-F-003: Existing Claude model configurations must continue to work without changes
- REQ-F-004: OpenAI models specified in config must pass through to OpenCode agents unchanged
- REQ-F-005: All phase-specific model overrides (`prd`, `implement`, `review`, etc.) must support OpenAI models
- REQ-F-006: Agent-specific model configurations (`opencode`, `claude`) must support OpenAI models

### Non-Functional Requirements
- REQ-NF-002: Changes must maintain 100% backward compatibility with existing hone.config.yml files
- REQ-NF-003: Error messages must clearly indicate supported model formats when validation fails

## Technical Considerations

**Current Architecture Analysis:**
- Model resolution uses 3-tier priority: phase-specific → agent-specific → default hardcoded
- Agent spawning already handles provider prefixes differently per agent type (OpenCode vs Claude)
- Validation regex in `validateConfig()` at line 221 of `src/config.ts` is the bottleneck

**Root Cause:**
The validation regex `/^claude-(sonnet|opus)-\d+-\d{8}$/` only accepts Claude model formats, creating a mismatch with the multi-provider architecture evidenced by:
- AI SDK dependencies supporting multiple providers
- Agent spawning logic that handles different provider prefixes
- OpenCode's native support for OpenAI models

**Integration Points:**
- `resolveModelForPhase()` function must continue returning model names as-is
- `spawnAgent()` provider prefix logic remains unchanged
- YAML configuration parsing in `loadConfig()` unaffected

**Implementation Strategy:**
Update the `modelRegex` in `validateConfig()` to support multiple model formats while maintaining validation strength for known patterns.

## Acceptance Criteria
- [ ] User can set `opencode: openai/gpt-5.3-codex` in hone.config.yml without validation errors  
- [ ] Existing configurations with `opencode: claude-sonnet-4-20250514` continue working
- [ ] Phase-specific overrides like `review: openai/gpt-4o` work correctly
- [ ] Agent-specific configurations like `opencode: openai/gpt-4o` work correctly
- [ ] OpenAI models pass through to OpenCode without provider prefix modification
- [ ] Invalid model names still trigger appropriate validation errors
- [ ] All existing unit tests continue to pass
- [ ] Build and linting commands complete successfully

## Out of Scope
- Adding support for new AI providers not already supported by OpenCode
- Modifying the `resolveModelForPhase()` function logic or priority order
- Changes to agent spawning behavior or provider prefix handling
- Automatic provider detection or model-to-provider mapping
- Configuration format changes beyond model name validation
- Adding model availability validation or API key verification
