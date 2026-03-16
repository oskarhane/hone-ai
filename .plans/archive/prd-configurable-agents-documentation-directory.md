Now I have comprehensive information about the codebase. Let me generate the PRD:

---

# PRD: Configurable Agents Documentation Directory

## Overview

Change the default agents documentation directory from `.agents-docs` to `.agents/` and make it configurable via the `hone.config.yml` file using a new `agentsDocsDir` property. This change affects the `agents-md` command which generates AGENTS.md files with supporting documentation.

## Goals

- Change default directory from `.agents-docs` to `.agents/`
- Add `agentsDocsDir` config property to `HoneConfig` interface
- Update all references in code, tests, documentation, and help text
- Maintain backward compatibility for existing projects (config override)
- Ensure comprehensive test coverage for the new configuration option

## Non-Goals

- Automatic migration of existing `.agents-docs` directories to `.agents/`
- Support for multiple agent doc directories
- Validation that the configured directory doesn't conflict with other project directories

## Requirements

### Functional Requirements

- REQ-F-001: Add optional `agentsDocsDir` property to `HoneConfig` interface with type `string`
- REQ-F-002: Default value for `agentsDocsDir` shall be `.agents/` when not specified in config
- REQ-F-003: Update `AGENTS_DOCS_DIR` constant usage in `agents-md-generator.ts` to read from config with fallback to default
- REQ-F-004: `generateAgentsMd()` function must accept config or use resolved `agentsDocsDir` value
- REQ-F-005: Generated AGENTS.md content must use configured directory in markdown links (e.g., `[@.agents/languages.md](.agents/languages.md)`)
- REQ-F-006: CLI help for `agents-md` command must document the configurable directory option
- REQ-F-007: `collectAgentsDocsMetadataSignals()` must read from configured directory path

### Non-Functional Requirements

- REQ-NF-001: Config validation must accept valid directory path strings for `agentsDocsDir`
- REQ-NF-002: Path must be relative to project root (no absolute paths)
- REQ-NF-003: Maintain existing error handling patterns using `HoneError` class

## Technical Considerations

### Files to Modify

1. **`src/config.ts`**:
   - Add `agentsDocsDir?: string` to `HoneConfig` interface
   - Add default in `DEFAULT_CONFIG`: `agentsDocsDir: '.agents/'`
   - Update config validation if needed

2. **`src/agents-md-generator.ts`**:
   - Keep `AGENTS_DOCS_DIR` as the new default value `.agents/`
   - Update functions to accept/use config's `agentsDocsDir`:
     - `generateAgentsMd()`
     - `collectAgentsDocsMetadataSignals()`
     - All internal helpers that use the directory path
   - Update log messages to reflect configured directory

3. **`src/agents-md-generator.test.ts`**:
   - Add tests for custom `agentsDocsDir` config
   - Test default value behavior
   - Test generated content uses configured directory
   - Update existing tests if they assume specific directory name

4. **`src/index.ts`**:
   - Update `agents-md` command help text to mention configurable directory

5. **`README.md`**:
   - Document `agentsDocsDir` config option with examples
   - Update any file structure examples to show `.agents/`

6. **`AGENTS.md`**:
   - Regenerate after implementation (will use new default)

### Integration Points

- Config loading via `loadConfig()` in `src/config.ts`
- `resolveModelForPhase()` pattern can inform how to resolve directory config
- Existing `MetadataSourceType` enum includes `'agents-docs'` - consider if name change needed

### Potential Challenges

- Existing projects with `.agents-docs` will need to either rename directory or add config override
- Tests that create temp directories need to handle both old and new defaults during transition
- The `MetadataSourceType` enum value `'agents-docs'` is used for source tracking - may want to keep as-is for compatibility

## Acceptance Criteria

- [ ] `HoneConfig` interface includes optional `agentsDocsDir: string` property
- [ ] Default value is `.agents/` when not configured
- [ ] `hone agents-md` creates directory at configured path
- [ ] Generated AGENTS.md links point to configured directory
- [ ] `hone agents-md --help` documents the config option
- [ ] README documents `agentsDocsDir` configuration
- [ ] All existing tests pass with updated default
- [ ] New tests verify custom directory configuration works
- [ ] Config with `agentsDocsDir: '.agents-docs'` preserves old behavior

## Out of Scope

- Migration tooling to rename existing directories
- Support for absolute paths in `agentsDocsDir`
- Validation that directory name doesn't conflict with common directories (`.git`, `node_modules`, etc.)
- Renaming `MetadataSourceType.agents-docs` enum value

## Open Questions

- Should trailing slash be required/normalized (`.agents/` vs `.agents`)?
- Should there be validation to prevent paths like `../outside-project`?
- Rename existing `.agents-docs` in this repo to `.agents/` as part of implementation?
