# Model Validation Regex Design

## Overview

Designed a multi-provider model validation regex to replace the Claude-only pattern in `src/config.ts:221`.

## New Regex Pattern

```regex
/^(?:(?:openai|anthropic|google)\/[\w.-]+|claude-(?:sonnet|opus)-\d+-\d{8})$/
```

## Pattern Breakdown

### Provider-Prefixed Models

`(?:openai|anthropic|google)\/[\w.-]+`

- Supports common AI providers: `openai`, `anthropic`, `google`
- Requires forward slash separator: `/`
- Model name allows: letters, numbers, dots, hyphens, underscores
- Examples: `openai/gpt-4o`, `anthropic/claude-sonnet-4`, `google/gemini-pro`

### Legacy Claude Format (Backward Compatibility)

`claude-(?:sonnet|opus)-\d+-\d{8}`

- Maintains existing format validation
- Examples: `claude-sonnet-4-20250514`, `claude-opus-4-20251231`

## Valid Model Formats

### OpenAI Models

- ✓ `openai/gpt-4o`
- ✓ `openai/gpt-5.3-codex`
- ✓ `openai/gpt-4-turbo`
- ✓ `openai/o1-preview`

### Anthropic Models (Provider-Prefixed)

- ✓ `anthropic/claude-sonnet-4`
- ✓ `anthropic/claude-opus-3.5`

### Claude Models (Legacy Format)

- ✓ `claude-sonnet-4-20250514`
- ✓ `claude-opus-4-20251231`

### Google Models

- ✓ `google/gemini-pro`
- ✓ `google/gemini-1.5-flash`

## Invalid Model Formats

### Malformed Models

- ✗ `malformed-model-123` - No provider prefix, wrong format
- ✗ `invalid/` - Missing model name after slash
- ✗ `/gpt-4o` - Missing provider before slash
- ✗ `openai` - Missing slash and model name
- ✗ `openai/` - Missing model name

### Invalid Characters

- ✗ `openai/gpt 4o` - Spaces not allowed
- ✗ `openai/gpt@4o` - @ symbol not allowed
- ✗ `anthropic/claude sonnet 4` - Spaces not allowed

### Wrong Provider Format

- ✗ `claude-sonnet-4` - Missing date suffix for legacy format
- ✗ `claude-haiku-4-20250514` - Haiku not in allowed variants

## Implementation Notes

1. **Backward Compatibility**: Legacy Claude models without provider prefix continue to work
2. **Forward Compatibility**: Adding new providers requires updating the provider list in the regex
3. **Validation Strength**: Pattern rejects empty strings, spaces, and special characters in model names
4. **Provider Extensibility**: Current providers are openai, anthropic, google; can be extended as needed

## Testing Considerations

Test cases should cover:

- All valid provider-prefixed formats
- Legacy Claude format validation
- Invalid format rejection (missing parts, special characters, wrong format)
- Agent-specific model configurations (opencode, claude)
- Phase-specific model overrides (prd, implement, review, finalize, etc.)
- Mixed configurations (some OpenAI, some Claude)

## Integration Points

- `validateConfig()` at `src/config.ts:219` - Update modelRegex variable
- Error messages should list supported formats for clarity
- No changes needed to `resolveModelForPhase()` - models pass through unchanged
- No changes needed to `spawnAgent()` - provider prefix handling remains as-is

## References

- PRD: `.plans/prd-fix-openai-model-provider-resolution-bug.md`
- Task: `task-002` in `.plans/tasks-fix-openai-model-provider-resolution-bug.yml`
- Current implementation: `src/config.ts:221`
