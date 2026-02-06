I'll analyze the project context and generate a comprehensive PRD for the `hone prune` command. Let me first examine the current codebase structure to understand the existing patterns.
Now let me examine some task files and the structure to understand how tasks are parsed:
Now let me check a sample task file to understand the YAML structure:
Perfect! Now I have a clear understanding of the project structure. Based on my analysis, I can generate a comprehensive PRD for the `hone prune` command. Here's what I understand:

1. **File Structure**: All PRDs, tasks, and progress files are in `.plans/` directory with naming pattern `prd-*.md`, `tasks-*.yml`, and `progress-*.txt`
2. **Task Completion Logic**: Tasks have status fields (`pending`, `completed`, `cancelled`, etc.) and `calculateStatus()` determines if all tasks are complete
3. **Project Patterns**: Uses Commander.js, TypeScript, Bun, follows atomic file operations, and has comprehensive error handling

# PRD: Hone Prune Command

## Overview
Add a `hone prune` command that automatically cleans up finished PRDs by moving completed PRD files and their associated task and progress files to a `.plans/archive/` folder. This helps maintain a clean workspace by archiving completed features while preserving historical records.

## Goals
- Provide automated cleanup for completed PRDs and related files
- Maintain organized workspace by separating active and completed features  
- Preserve historical records by archiving rather than deleting files
- Give users visibility into pruning operations with summary output and dry-run capability
- Follow existing hone-ai CLI patterns and error handling standards

## Non-Goals
- Automatic pruning without user initiation
- Deletion of files (only move/archive operations)
- Pruning of incomplete or partially completed PRDs
- Cross-project or global pruning capabilities

## Requirements

### Functional Requirements
- REQ-F-001: Command shall identify completed PRDs by parsing associated task YAML files and verifying all tasks have status `completed` or `cancelled`
- REQ-F-002: Command shall create `.plans/archive/` directory automatically if it doesn't exist
- REQ-F-003: Command shall move completed PRD triplets (prd-*.md, tasks-*.yml, progress-*.txt files) atomically to archive folder
- REQ-F-004: Command shall display summary of moved files showing count and feature names
- REQ-F-005: Command shall support `--dry-run` flag to preview operations without executing moves
- REQ-F-006: Command shall preserve file structure and naming in archive folder
- REQ-F-007: Command shall handle missing task or progress files gracefully (PRD without tasks still archives if no pending work)

### Non-Functional Requirements  
- REQ-NF-001: Command shall complete operations atomically to prevent partial moves
- REQ-NF-002: Command shall provide clear error messages for file access issues
- REQ-NF-003: Command shall follow existing CLI help and documentation patterns
- REQ-NF-004: Command shall handle concurrent access safely using atomic operations
- REQ-NF-005: Command shall maintain performance with large numbers of PRD files

## Technical Considerations

**Integration Points:**
- Reuse existing `listPrds()` and `calculateStatus()` functions from `src/prds.ts`
- Follow Commander.js command patterns from `src/index.ts`
- Use atomic file operations pattern from existing commands
- Integrate with `getPlansDir()` configuration system

**Architecture Decisions:**
- Leverage existing task status calculation logic rather than reimplementing
- Use atomic file moves with temporary staging for data integrity
- Implement as synchronous operation to provide immediate feedback
- Follow existing error handling patterns with `HoneError` class

**Potential Challenges:**
- File system race conditions during concurrent access
- Handling partially complete archive operations
- Path traversal security validation for archive operations
- Cross-platform file system compatibility

## Acceptance Criteria
- [ ] `hone prune` command recognized by CLI with proper help text
- [ ] Command identifies completed PRDs by parsing task YAML status fields
- [ ] Archive directory created automatically when needed
- [ ] All three file types (PRD, tasks, progress) moved together atomically
- [ ] Summary shows "Moved X finished PRDs to archive: feature-a, feature-b, feature-c"
- [ ] `--dry-run` flag previews operations without executing moves
- [ ] Error handling for missing files, permission issues, and file system errors
- [ ] Atomic operations prevent partial moves during interruption
- [ ] Command follows existing CLI patterns for consistency
- [ ] Unit and integration tests cover all functionality

## Out of Scope
- Automatic or scheduled pruning operations
- Selective file type pruning (PRD only, tasks only, etc.)
- Archive compression or space optimization
- Remote or cloud archive storage
- Restoration of archived files (separate feature)
- Pruning based on date/time criteria rather than completion status

## Open Questions
- Should archived files maintain subdirectory structure or flatten into single archive folder? - single archive folder
- How should command handle PRDs that have tasks files but no progress files? - leave them, but warn the user
- Should there be a confirmation prompt for non-dry-run operations? - no
- What logging level should be used for archive operations? - info
