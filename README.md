# hone

**AI Coding Agent Orchestrator** — Orchestrate AI agents (opencode or claude) to implement features based on PRDs.

hone manages the full development lifecycle from requirements gathering through implementation, review, and commits — enabling iterative, autonomous development with human oversight.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [OpenCode](https://opencode.ai) or [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) CLI
- [Anthropic API key](https://console.anthropic.com/)
- Git-initialized project

## Installation

### Global Installation via npm

```bash
npm install -g hone-ai
```

This makes the `hone` command available system-wide.

### From Source

```bash
bun install
```

### Build Single Executable

Build a standalone macOS executable:

```bash
bun run build
```

This creates a `hone` binary that can be moved anywhere (e.g., `/usr/local/bin/hone`).

## Setup

1. Initialize hone in your project:
```bash
bun src/index.ts init
# or if installed globally: hone init
```

This creates:
- `.plans/` directory for storing PRDs, tasks, and progress
- `.plans/hone.config.json` with default configuration

2. Create `.env` file in project root:
```bash
ANTHROPIC_API_KEY=your_api_key_here
```

Note: Other commands will auto-initialize if you skip the `init` step.

## Configuration

Configuration is stored in `.plans/hone.config.json`:

```json
{
  "defaultAgent": "claude",
  "models": {
    "prd": "claude-sonnet-4-20250514",
    "tasks": "claude-sonnet-4-20250514"
  },
  "commitPrefix": true,
  "feedbackCommand": "bun test",
  "lintCommand": null
}
```

## Usage

### Initialize Project

```bash
bun src/index.ts init
```

Creates `.plans/` directory and config file. Safe to run multiple times — won't overwrite existing setup.

### List PRDs

```bash
bun src/index.ts prds
```

Example output:
```
PRDs in .plans/

  prd-user-avatar-upload.md
    Tasks: tasks-user-avatar-upload.yml
    Status: in progress (3/7 completed)

  prd-dark-mode.md
    Tasks: none
    Status: not started
```

### Generate PRD

```bash
bun src/index.ts prd "Add user avatar upload with cropping"
```

Interactive session with up to 5 rounds of clarifying questions. Type `done` to proceed anytime.

### View Task Status

```bash
bun src/index.ts status
```

Example output:
```
Incomplete task lists:

  tasks-user-avatar-upload.yml
    Feature: user-avatar-upload
    Progress: 3/7 tasks completed
    Next: task-004 - Add confirmation dialog
```

### Generate Tasks from PRD

```bash
bun src/index.ts prd-to-tasks .plans/prd-user-avatar-upload.md
```

Creates `tasks-user-avatar-upload.yml` with dependency-ordered task list.

### Execute Tasks

Execute n iterations with review phase:
```bash
bun src/index.ts run .plans/tasks-user-avatar-upload.yml -i 5
```

Skip review for faster iteration:
```bash
bun src/index.ts run .plans/tasks-user-avatar-upload.yml -i 5 --skip=review
```

Use specific agent:
```bash
bun src/index.ts run .plans/tasks-user-avatar-upload.yml -i 3 --agent opencode
```

## How It Works

Each iteration executes up to 3 agent invocations:

1. **Implement**: Agent selects and implements the most important uncompleted task (respecting dependencies)
2. **Review** *(optional)*: Agent reviews changes for correctness, tests, security, performance
3. **Finalize**: Agent applies feedback, updates task file/progress log/AGENTS.md, commits changes

The agent has full access to:
- `/AGENTS.md` — Project-specific patterns and learnings
- `.plans/tasks-<feature>.yml` — Full task list with dependencies
- `.plans/progress-<feature>.txt` — Iteration history

## File Structure

```
project-root/
├── .plans/
│   ├── hone.config.json           # Configuration
│   ├── prd-<feature>.md           # PRD files
│   ├── tasks-<feature>.yml        # Task lists
│   └── progress-<feature>.txt     # Progress logs
├── AGENTS.md                      # Project knowledge base
└── .env                          # API keys
```

## Examples

### Full workflow
```bash
# Generate PRD
bun src/index.ts prd "Add email notifications for order status"

# Generate tasks
bun src/index.ts prd-to-tasks .plans/prd-email-notifications.md

# Check status
bun src/index.ts status

# Execute 5 iterations
bun src/index.ts run .plans/tasks-email-notifications.yml -i 5

# Continue with more work, skip review
bun src/index.ts run .plans/tasks-email-notifications.yml -i 3 --skip=review

# Check progress
bun src/index.ts prds
```

### Use different agent
```bash
bun src/index.ts run .plans/tasks-feature.yml -i 2 --agent opencode
```

## Testing

Run unit and integration tests:
```bash
bun test
```

## Error Handling

hone handles common errors gracefully:

- **Missing API key**: Instructions to create `.env` file
- **Agent not found**: Installation instructions
- **Task failure**: Exits immediately, failed task remains pending for retry
- **Network errors**: Automatic retry with exponential backoff (3 attempts)

## Development

This project uses:
- Bun runtime
- commander.js for CLI parsing
- js-yaml for YAML parsing
- Anthropic SDK for AI operations
- Tests next to source files (`x.test.ts`)

## License

MIT
