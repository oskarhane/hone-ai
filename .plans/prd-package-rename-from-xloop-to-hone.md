# PRD: Package Rename from xloop to hone

## Overview
Rename the xloop package/library to hone across all aspects of the project including package name, binary name, internal references, documentation, and repository. The npm package will be named "hone-ai" while the CLI binary will be "hone". This is a comprehensive rebrand that removes all traces of "xloop" from the codebase and project.

## Goals
- Rebrand the package from xloop to hone with clear, consistent naming
- Publish npm package as "hone-ai" with CLI binary accessible as "hone"
- Update all internal code references, documentation, and configuration
- Rename repository and related project assets
- Implement breaking changes including CLI command updates (e.g., "do" → "run")
- Ensure global installation works seamlessly (`npm install -g hone-ai` → `hone` command)

## Non-Goals
- Maintaining backward compatibility with xloop naming
- Creating migration paths for existing xloop installations
- Publishing deprecation notices for xloop (package was never published)
- Supporting both naming conventions simultaneously

## Requirements

### Functional Requirements
- REQ-F-001: Package.json must specify name as "hone-ai"
- REQ-F-002: Binary executable must be accessible as "hone" when installed globally
- REQ-F-003: CLI must support standard patterns: `hone --version`, `hone help`, `hone run`
- REQ-F-004: All source code references to "xloop" must be replaced with "hone"
- REQ-F-005: All documentation files must be updated to reference "hone"
- REQ-F-006: Configuration directories must use hone naming (e.g., `.hone/` instead of `.xloop/`)
- REQ-F-007: Repository name must be changed to reflect new package name
- REQ-F-008: CLI command "do" must be renamed to "run"
- REQ-F-009: All internal module names, class names, and function names containing "xloop" must be updated
- REQ-F-010: Error messages and logs must reference "hone" instead of "xloop"

### Non-Functional Requirements
- REQ-NF-001: Package must be installable globally via npm without conflicts
- REQ-NF-002: Binary name "hone" must not conflict with existing system commands
- REQ-NF-003: All references must be consistently named throughout the codebase
- REQ-NF-004: Documentation must be clear about the new naming convention
- REQ-NF-005: Installation and usage experience must be seamless with new naming

## Technical Considerations

### Architecture Decisions
- **Package Structure**: Maintain existing src/ directory structure while updating all internal references
- **Binary Configuration**: Use package.json "bin" field to map "hone" to the executable entry point
- **Module System**: Update all import/export statements that reference xloop modules
- **CLI Framework**: Ensure existing CLI framework supports the command rename from "do" to "run"

### Integration Points
- **NPM Registry**: New package publication as "hone-ai"
- **GitHub**: Repository rename and URL updates
- **Documentation Sites**: Any hosted documentation requiring URL updates
- **CI/CD**: Pipeline configurations referencing package name or repository

### Potential Challenges
- **File System Operations**: Updating all hardcoded paths that reference xloop directories
- **String Literals**: Identifying and updating all string references in code and configuration
- **External References**: Any third-party documentation or examples that reference the old name
- **Testing**: Ensuring all tests pass with new naming convention
- **Build Process**: Updating build scripts and configuration files

## Acceptance Criteria
- [ ] Package.json updated with name "hone-ai" and binary mapping to "hone"
- [ ] Global installation via `npm install -g hone-ai` enables `hone` command
- [ ] All source files updated to use "hone" instead of "xloop" in variables, functions, classes
- [ ] CLI commands work: `hone --version`, `hone help`, `hone run` (formerly `hone do`)
- [ ] All documentation (README, JSDoc comments, etc.) references "hone"
- [ ] Configuration directories use `.hone/` naming convention
- [ ] Repository renamed to reflect new package name
- [ ] No remaining references to "xloop" anywhere in the codebase
- [ ] Error messages and user-facing text use "hone" branding
- [ ] All tests pass with updated naming
- [ ] Build and deployment processes work with new package name

## Out of Scope
- Creating alias packages or backward compatibility layers
- Migrating existing user configurations from xloop to hone
- Maintaining any xloop branding or references
- Publishing deprecation notices for unpublished xloop package
- Supporting gradual migration - this is a complete cutover

## Open Questions
- Should we implement any checks to warn users if they have old xloop configurations that need manual cleanup? No.
- Are there any specific npm publish settings or keywords we should include for discoverability of "hone-ai"? No.
- Should we reserve the "hone" package name on npm for potential future use, or is "hone-ai" sufficient? hone-ai is sufficient.
