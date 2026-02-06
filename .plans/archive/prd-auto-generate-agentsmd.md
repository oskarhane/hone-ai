# PRD: Auto-generate AGENTS.md

## Overview

A CLI command `hone agents-md` that automatically generates comprehensive AGENTS.md documentation by analyzing codebases across multiple programming languages, using the agents. The tool instructs the agents via prompts to extract architectural patterns, dependencies, build systems, testing frameworks, and development workflows to create standardized documentation that helps developers understand project conventions.

## Goals

- Reduce manual documentation overhead for development teams
- Maintain consistent documentation standards across projects
- Provide quick project onboarding through auto-discovered patterns
- Support multiple programming languages and build systems
- Generate actionable documentation that agents can use effectively
- Use the agents (claude / opencode) to scan and discover things

## Non-Goals

- Real-time documentation synchronization
- Integration with external documentation systems
- Code generation or modification capabilities
- Version control integration beyond basic file operations

## Requirements

### Functional Requirements

- **REQ-F-001**: Command must work as standalone tool without requiring `hone init`
- **REQ-F-002**: Support language-agnostic analysis (Java, Scala, Python, JavaScript/TypeScript, Bun, etc.)
- **REQ-F-002-1**: Use the existing agents to discover. Write prompts rather than code.
- **REQ-F-003**: Auto-discover build systems (Maven, Gradle, npm, pip, cargo, etc.)
- **REQ-F-004**: Extract dependency management patterns from config files
- **REQ-F-005**: Identify testing frameworks and test commands
- **REQ-F-006**: Detect deployment and build patterns
- **REQ-F-007**: Analyze project structure and architectural decisions
- **REQ-F-008**: Generate adaptive AGENTS.md format based on discovered tech stack
- **REQ-F-009**: Limit AGENTS.md to 100 lines maximum
- **REQ-F-010**: Create .agents-docs/ subdirectory with topic-specific files for detailed info
- **REQ-F-011**: Support both static analysis and dynamic command discovery
- **REQ-F-012**: Handle existing AGENTS.md files (update vs replace decision)

### Non-Functional Requirements

- **REQ-NF-001**: Command execution time under 90 seconds for typical projects
- **REQ-NF-002**: Graceful handling of permission-restricted directories
- **REQ-NF-004**: No external dependencies for cross-platform compatibility, use the agents

## Technical Considerations

### Integration Points

- **Commander.js**: New command integration following existing hone CLI patterns
- **Logger Module**: Verbose/quiet output control using src/logger.ts patterns
- **Agents claude/opencode**: Use the existing agents

### Potential Challenges

- **Language Detection**: Accurately identifying primary languages in polyglot projects
- **Output Size Control**: Staying within 100-line limit while providing value

## Acceptance Criteria

- [ ] `hone agents-md` command available without prior initialization
- [ ] Generated AGENTS.md stays within 100-line limit
- [ ] Creates .agents-docs/ directory with topic-specific files when needed
- [ ] References .agents-docs/ files from main AGENTS.md with relative paths
- [ ] Handles existing AGENTS.md files appropriately
- [ ] Provides clear success/error feedback
- [ ] Discovers available test commands dynamically
- [ ] Identifies build and deployment patterns
- [ ] Extracts dependency management information
- [ ] Adapts output format based on detected tech stack

## Out of Scope

- Git integration or commit operations
- Real-time file watching and updates
- Integration with external documentation platforms
- Code modification or generation capabilities
- Database or persistent storage requirements
- Network-dependent discovery mechanisms
- IDE or editor integrations
- Scanning anything without going through the agents

## Open Questions

- Should command overwrite existing AGENTS.md without prompting? - Yes
- How handle mixed-language projects (e.g., Java backend + React frontend)? - Create sub pages for each
- Should .agents-docs/ files be overwritten or merged with existing content? - Overwritten
- What priority order for language detection in polyglot repos? - The agent willd decide
- Should command respect .gitignore patterns during scanning? - The agent will decide
- How handle monorepos with multiple project roots? - Keep a single AGENTS.md in root-root
