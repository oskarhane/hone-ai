I'll examine the codebase structure to understand the PRD and task file formats before generating the PRD.
Now I'll create a comprehensive PRD for the extend-prd command based on my understanding of the project structure:

# PRD: Extend PRD Command

## Overview
Add a new CLI command `hone extend-prd <prd-file> <requirement-description>` that allows users to incrementally add new requirements to existing PRD files. The command will ask clarifying questions, append the refined requirements to the existing PRD, and generate only the incremental tasks needed for the new functionality while preserving the existing task file structure.

## Goals
- Enable iterative enhancement of existing PRDs without starting from scratch
- Maintain consistency with existing PRD generation patterns and AI-assisted refinement
- Generate only incremental tasks for new requirements to avoid duplication
- Preserve existing task dependencies and completion status
- Integrate seamlessly with the current CLI architecture and configuration system

## Non-Goals
- Modifying or regenerating existing requirements within the PRD
- Regenerating all tasks for the entire updated PRD
- Providing a GUI interface for PRD editing
- Supporting bulk requirement additions in a single command

## Requirements
### Functional Requirements
- REQ-F-001: Accept PRD file path and requirement description as command arguments
- REQ-F-002: Validate that the specified PRD file exists and follows expected format
- REQ-F-003: Conduct interactive Q&A session to refine the new requirement similar to existing PRD generation
- REQ-F-004: Parse and understand existing PRD structure to maintain consistency
- REQ-F-005: Append new requirements to appropriate sections (Functional/Non-Functional Requirements)
- REQ-F-006: Update Technical Considerations, Acceptance Criteria, and other sections as needed
- REQ-F-007: Generate incremental tasks only for the new requirement
- REQ-F-008: Append new tasks to existing task file while preserving existing task structure
- REQ-F-009: Assign unique task IDs that don't conflict with existing tasks
- REQ-F-010: Support file path and URL references in requirement descriptions with automatic content fetching
- REQ-F-011: Update task file metadata (updated_at timestamp) when adding new tasks

- REQ-F-012: Print completion message with exact command format to start work after successfully extending the PRD
- REQ-F-013: Display command in format "hone run .plans/{tasks-filename} -i {new-task-count}" where task-count represents only the newly added tasks
- REQ-F-014: Calculate and display the count of new tasks added during the extension process
- REQ-F-015: Include the correct task filename derived from the original PRD filename in the printed command
- REQ-F-016: Command output format must match the existing prd-to-tasks command pattern for consistency
- REQ-F-017: New task count calculation must be accurate and reflect only incremental additions

- REQ-F-018: Remove local content fetching functions (fetchUrlContent, fetchFileContent, fetchContentReferences) from extend-prd command implementation
- REQ-F-019: Delegate all content fetching operations for URLs and file references to the underlying agent via system prompt instructions
- REQ-F-020: Update extend-prd system prompts to instruct the agent to automatically read file paths and fetch URLs using agent tools
- REQ-F-021: Modify Q&A generation and requirements generation functions to rely on agent-based content fetching instead of local fetching
- REQ-F-022: Remove ContentReference, ContentContext interfaces and related content processing logic from extend-prd module
- REQ-F-023: Update error handling to account for agent-based content fetching failures instead of local network/file errors
- REQ-F-024: Content fetching delegation must maintain same user experience as current local implementation
- REQ-F-025: Agent-based content fetching should provide equivalent error reporting for inaccessible files and URLs
- REQ-F-026: Refactoring must preserve all existing extend-prd functionality while simplifying the codebase
- REQ-F-027: Implementation should follow the same delegation pattern established in the prd command

### Non-Functional Requirements
- REQ-NF-001: Command execution time should not exceed 60 seconds for typical requirements
- REQ-NF-002: Generated content must maintain consistency with existing PRD tone and structure
- REQ-NF-003: Task ID generation must be deterministic and collision-free
- REQ-NF-004: File operations must be atomic to prevent corruption on interruption
- REQ-NF-005: Support the same model configuration system (phase-specific models)
- REQ-NF-006: Error messages should provide clear guidance for resolution
## Technical Considerations

### Architecture Integration
- Follow existing command pattern using Commander.js in `src/index.ts`
- Leverage existing `AgentClient` and model resolution from `src/agent.ts`
- Reuse PRD generation patterns from `src/prd-generator.ts` for Q&A flow
- Extend task generation logic from `src/task-generator.ts` for incremental task creation

### File Processing
- Use existing file reading utilities to parse PRD markdown structure
- Implement section-aware parsing to identify where to insert new requirements
- Maintain YAML structure integrity when appending to task files
- Handle concurrent file access scenarios gracefully

### Task ID Management
- Implement ID collision detection by parsing existing task IDs
- Use sequential numbering scheme (`task-001`, `task-002`, etc.) continuing from highest existing ID
- Validate task ID uniqueness before writing to file

### Model Configuration
- Support `extendPrd` phase-specific model configuration in `hone.config.yml`
- Default to `prd` phase model configuration if `extendPrd` not specified
- Follow existing model resolution priority: phase-specific → agent-specific → default

### Error Handling
- Validate PRD file exists and is readable
- Check for corresponding task file existence and readability
- Handle network errors when fetching file/URL content
- Provide rollback mechanism if task generation fails after PRD modification

## Acceptance Criteria
- [ ] Command `hone extend-prd <prd-file> <requirement>` executes successfully
- [ ] Interactive Q&A session prompts user for requirement clarification
- [ ] New requirements are appended to correct PRD sections without modifying existing content
- [ ] Generated tasks have unique IDs that don't conflict with existing tasks
- [ ] Task file metadata is updated with new timestamp
- [ ] Existing task completion status and dependencies are preserved
- [ ] File path and URL references in requirements are automatically processed
- [ ] Command respects configured model settings for the extend-prd phase
- [ ] Error messages guide users toward resolution for common failure scenarios
- [ ] Generated content maintains stylistic consistency with existing PRD
- [ ] Task dependencies are properly analyzed for new tasks in relation to existing ones

## Out of Scope
- Editing or removing existing requirements from PRDs
- Reordering existing tasks or requirements
- Merging multiple PRDs
- Providing undo functionality for extend operations
- Supporting requirement templates or predefined requirement categories
- Bulk processing multiple requirements in single command invocation

## Open Questions
- Should new tasks automatically analyze dependencies with existing tasks or require manual specification?
- What should happen if the requirement description conflicts with existing PRD goals or non-goals?
- Should the command support dry-run mode to preview changes before applying?
- How should requirement numbering continue if existing requirements don't follow REQ-F-XXX pattern?