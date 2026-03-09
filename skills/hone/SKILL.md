# hone Skill

Use hone to orchestrate AI agents for feature development using a structured PRD → tasks → implementation loop.

## When to use this skill

Use this skill when the user wants to:
- Implement a feature using hone's AI agent orchestration workflow
- Create or manage PRDs and task files
- Run the hone implementation loop
- Extend existing PRDs with new requirements
- Check feature status or clean up completed features

## Core Workflow

```bash
# 1. Generate project documentation (once per project)
hone agents-md

# 2. Create a PRD from a feature description
hone prd "Add user login with email and password"

# 3. Review the generated PRD manually
# Edit .plans/prd-<feature>.md as needed

# 4. Generate tasks from the PRD
hone prd-to-tasks .plans/prd-<feature>.md

# 5. Implement the feature
hone run .plans/tasks-<feature>.yml -i 10
```

## Commands

### `hone init`
Initialize hone in the current project directory. Creates `.plans/` directory and `hone.config.yml`.

### `hone agents-md`
Generate `AGENTS.md` documentation for the project. Run once when starting a new project.

```bash
hone agents-md           # Generate AGENTS.md
hone agents-md --overwrite  # Regenerate existing AGENTS.md
```

### `hone prd "<description>"`
Generate a PRD interactively from a feature description. Supports file and URL references.

```bash
hone prd "Add authentication"
hone prd "Implement feature based on ./docs/spec.md"
hone prd "Build payment integration from https://stripe.com/docs/api"
```

### `hone prd-to-tasks <prd-file>`
Generate a task breakdown YAML from a PRD file.

```bash
hone prd-to-tasks .plans/prd-user-auth.md
```

### `hone extend-prd <prd-file> "<requirement>"`
Add new requirements to an existing PRD with AI-guided refinement and automatic task generation.

```bash
hone extend-prd .plans/prd-user-auth.md "Add OAuth with Google"
```

### `hone run <tasks-file> -i <N>`
Execute the implement → review → finalize loop for N iterations.

```bash
hone run .plans/tasks-feature.yml -i 10
hone run .plans/tasks-feature.yml -i 5 --agent opencode
hone run .plans/tasks-feature.yml -i 5 --skip=review
hone run .plans/tasks-feature.yml -i 5 --verbose
```

### `hone status`
Show incomplete task lists across all features.

### `hone prds`
List all PRDs with their status and task file links.

### `hone prune`
Archive completed PRDs and their associated files to `.plans/archive/`.

```bash
hone prune            # Archive completed features
hone prune --dry-run  # Preview without moving files
```

### `hone skill`
Print these installation instructions and the skill file contents.

## File Structure

```
project-root/
├── .plans/
│   ├── hone.config.yml       # Configuration
│   ├── prd-<feature>.md      # Requirements
│   ├── tasks-<feature>.yml   # Task breakdown
│   ├── progress-<feature>.txt # Development log
│   └── archive/              # Archived completed features
└── AGENTS.md                 # AI learning notes
```

## Configuration

Edit `.plans/hone.config.yml`:

```yaml
version: 2
agent: claude              # Default agent: claude or opencode
claude:
  model: claude-sonnet-4-6
  models:
    prd: claude-opus-4-6
    implement: claude-sonnet-4-6
    review: claude-opus-4-6
opencode:
  model: anthropic/claude-sonnet-4-6
```

**Model resolution order:** phase model → agent model → hardcoded default

**Valid phase keys:** `prd`, `prdToTasks`, `implement`, `review`, `finalize`, `agentsMd`, `extendPrd`

## Tips

- Each `hone run` iteration starts with a fresh agent context — no context drift over time
- Failed tasks remain `pending` and are retried on next run
- You can manually add tasks to the YAML file at any time
- Use `--verbose` to see detailed agent interaction logs
- The `progress-<feature>.txt` file tracks what has been implemented and why

## Prerequisites

- Bun runtime
- Claude Code (`claude`) or OpenCode (`opencode`) CLI installed
- Git-initialized project
