# hone-ai

**AI Coding Agent Orchestrator** — Automatically implement features from requirements using AI agents.

Transform feature ideas into working code through autonomous development with human oversight.

![info](.github/info.png)

## Why

When working on long running tasks with agents, their context window fills up and the performance degrades. To mitigate this, hone-ai provides a solution starting each new iteration with a fresh context window just passing in a summary of the progress made so far on the specific PRD, repository architecture and gotchas, and any other relevant information.

Everything else is stripped away, leaving only the essential information needed for the next iteration. This approach helps maintain optimal performance and reduces the likelihood of context drift.

It's a surprisingly powerful process.

## Quick Start

1. **Install hone**

   ```bash
   npm install -g hone-ai
   # or
   bun add -g hone-ai
   # or
   # download binary or build from source, instructions below
   ```

2. **Install an AI agent** ([OpenCode](https://opencode.ai) or [Claude Code](https://docs.anthropic.com/claude/docs/claude-code))

3. **Initialize in your project**

   ```bash
   hone init
   ```

That's it! You're ready to use hone.

## Common Workflow

```bash
# 1. Generate project documentation (if no AGENTS.md exists). A one time thing.
hone agents-md

# 2. Create a PRD from your feature description
hone prd "Add user login with email and password"

# 3. Manually review the generated PRD
#    Edit .plans/prd-user-login.md as needed

# 4. Generate tasks from the PRD
hone prd-to-tasks .plans/prd-user-login.md

# 5. (Optional) Extend PRD with additional requirements
hone extend-prd .plans/prd-user-login.md "Add two-factor authentication"

# 6. Implement the feature
hone run .plans/tasks-user-login.yml -i 10

# 7. Archive completed features (optional)
hone prune
```

hone will implement the feature, run tests, and commit changes automatically.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [OpenCode](https://opencode.ai) or [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) CLI
- Git-initialized project

## Installation Options

### Global Installation (Recommended)

```bash
npm install -g hone-ai
# or
bun add -g hone-ai
```

### From Source

```bash
git clone https://github.com/oskarhane/hone-ai.git
cd hone-ai
bun install
```

Use `bun src/index.ts` instead of `hone` for all commands.

### Standalone Binary

Download pre-built binaries from [GitHub Releases](https://github.com/oskarhane/hone-ai/releases).

**macOS users**: Remove the quarantine attribute after downloading:

```bash
unzip hone-v*-macos.zip
xattr -d com.apple.quarantine hone-v*-macos/hone
cp hone-v*-macos/hone /usr/local/bin/
```

Or build from source:

```bash
bun run build
cp hone-macos /usr/local/bin/hone  # macOS
cp hone-linux /usr/local/bin/hone  # Linux
```

## Concepts

### A Feature

A feature has three files:

- `prd-<feature>.md` - Feature description, goals, non-goals, and acceptance criteria.
- `tasks-<feature>.yml` - A task breakdown of the prd. Description, status, dependencies, and most important, acceptance criteria for each task.
- `progress-<feature>.txt` - A continuously updated progress report on description of what has been done, choices made for each **task** etc.

To create a feature, you run `hone prd "<description or link or file>"`.  
To break down a PRD into tasks, you run `hone prd-to-tasks .plans/prd-<feature>.md`.

### Implementation loop

The implementation loop is a continuous process of iterating over the tasks in a feature's `tasks-<feature>.yml` file.
This is the most important part: every iteration starts with a new agent invocation, i.e. a new agent context.

This also means that you can work some time on a feature, switch to a different feature and get back to the old one without polluting the context or have the agent digress over time.

The agent context is initialized with 3 files (plus directions via the prompt):

- `tasks-<feature>.yml`
- `progress-<feature>.txt`
- `AGENT.md` - information on how to run feedback loops in here, extremely important!

The tasks file has a link to the PRD file so the agent knows how to find it if needed.

The Agent decides what task to work on in each iteration of the loop.

Implementation has three stages:

1. **Implementation**: Implement the chosen task. Run feedback loops (type checking, linting, unit testing) before moving forward.
2. **Review**: Have the agent review the implementation (preferably with a different LLM). Run feedback loops (type checking, linting, unit testing) again.
3. **Finalization**: Finalize the implementation with the Agent. Run feedback loops (type checking, linting, unit testing) again. Update the task status in `tasks-<feature>.yml`, write a summary in `progress-<feature>.txt`, and update AGENT.md with gotchas if necessary.

To work on a feature you run `hone run .plans/tasks-<feature>.yml -i <iterations>`.

#### The power of the loop

The real benefits of having this implementation loop with a very focused and on point agent context each iteration is that the agents don't get distracted or digress over time. After each task, everything is cleaned up and ready to be picked up at any time without having to look for old chat threads to find important information needed for the implementation.

> **The focused context combined with clear task acceptance criteria and running feedback loops (linting, testing etc.) in each step is key**.

This usually takes you to a good 90% of a completely finished feature (depending on the size/complexity, often it takes you 100%) and if needed you'd use the agent directly a bit back and forth to get all the way.

#### Extending PRDs and editing tasks

You can at any time manually add new tasks in the tasks file for a feature. Just add them in the same format as the rest and set their status to `pending` and the agent will get to them.

If you want to add something larger to an existing feature and don't fancy writing a lot of tasks yourself you can extend a PRD and have the agent create new tasks in the existing tasks file. `hone extend-prd .plans/prd-<feature>.md "<added scope description>"`.

## Commands

### Create and implement a feature

```bash
hone agents-md                              # Generate AGENTS.md (first time only)
hone prd "Feature description"              # Generate requirements
# Review .plans/prd-<feature>.md manually
hone prd-to-tasks .plans/prd-feature.md     # Generate tasks
hone run .plans/tasks-feature.yml -i 10     # Implement tasks
```

### Extend existing PRDs with new requirements

```bash
# Add new requirements with interactive refinement
hone extend-prd .plans/prd-user-auth.md "Add OAuth integration with Google and GitHub"

# Reference files in requirement descriptions
hone extend-prd .plans/prd-api.md "Add rate limiting based on ./docs/rate-limits.md"

# Reference URLs for external specifications
hone extend-prd .plans/prd-payment.md "Integrate Stripe API from https://docs.stripe.com/api"
```

### Reference files and URLs in PRDs

```bash
# Reference local files in your PRD description
hone prd "Implement user authentication based on ./docs/auth-spec.md"
hone prd "Add dashboard following the component in ./src/components/Dashboard.tsx"

# Reference URLs for external specifications
hone prd "Create payment integration using https://stripe.com/docs/api"
hone prd "Build social login with https://developers.google.com/identity/protocols/oauth2"
```

hone automatically reads referenced files and fetches URL content to inform PRD generation.

### Check progress

```bash
hone status                                 # See incomplete tasks
hone prds                                  # List all features
```

### Clean up completed features

```bash
hone prune                                 # Archive completed PRDs to .plans/archive/
hone prune --dry-run                       # Preview what would be archived
```

### Advanced options

```bash
hone run tasks.yml -i 3 --agent opencode   # Use specific agent
hone run tasks.yml -i 5 --skip=review      # Skip code review
hone run tasks.yml -i 5 --verbose          # Show detailed agent interaction logs
```

### Verbose mode

Add `--verbose` to any command to see detailed agent interaction logs. By default, hone only shows progress indicators and critical messages. With `--verbose`, you get the full output from agent interactions, useful for debugging or understanding what the agent is doing.

```bash
hone prd "Add login" --verbose
hone agents-md --verbose
```

## Configuration

Edit `.plans/hone.config.yml` to customize models, directories, and agents.

### Basic configuration (v2 format)

```yaml
version: 2
agent: claude # default agent: claude or opencode
claude:
  model: claude-sonnet-4-6 # default model for all claude phases
opencode:
  model: anthropic/claude-sonnet-4-6 # default model for all opencode phases
agentsDocsDir: '.agents/' # directory for generated documentation (default: .agents/)
```

### Agent-specific model configuration

Each agent (`claude`, `opencode`) has its own model block. Set a default model for the agent, or override individual phases:

```yaml
version: 2
agent: claude
claude:
  model: claude-sonnet-4-6 # fallback for all phases
  models:
    prd: claude-sonnet-4-6 # PRD generation
    prdToTasks: claude-opus-4-6 # task breakdown (expensive, use powerful model)
    implement: claude-sonnet-4-6 # implementation
    review: claude-opus-4-6 # code review (expensive, use powerful model)
    finalize: claude-sonnet-4-6 # finalization
    agentsMd: claude-opus-4-6 # AGENTS.md generation
    extendPrd: claude-sonnet-4-6 # PRD extension
opencode:
  model: anthropic/claude-sonnet-4-6
  models:
    implement: openai/gpt-4o # use a different model just for implementation
```

**Model resolution order:** phase model → agent model → hardcoded default

**Valid phase keys:** `prd`, `prdToTasks`, `implement`, `review`, `finalize`, `agentsMd`, `extendPrd`

**Model name formats:**
- Provider-prefixed: `openai/gpt-4o`, `anthropic/claude-opus-4-6`, `google/gemini-2.0-flash`
- Legacy Claude format: `claude-sonnet-4-6`, `claude-opus-4-6`

**Directory configuration:**

- `agentsDocsDir` - Directory where `hone agents-md` generates detailed documentation files (default: `.agents/`)
- Use `agentsDocsDir: '.agents-docs'` to preserve the old directory name for backward compatibility

### Migrating from v1 to v2 config

hone automatically migrates v1 configs to v2 on first load — no manual action required.

**v1 (old format):**

```yaml
defaultAgent: claude
models:
  claude: claude-sonnet-4-6
  opencode: anthropic/claude-opus-4-5
  review: claude-opus-4-6
  agentsMd: claude-opus-4-6
lintCommand: bun run lint
```

**v2 (new format, auto-migrated):**

```yaml
version: 2
agent: claude # was defaultAgent
claude:
  model: claude-sonnet-4-6 # was models.claude
  models:
    review: claude-opus-4-6 # phase keys scoped to defaultAgent's block
    agentsMd: claude-opus-4-6
opencode:
  model: anthropic/claude-opus-4-5 # was models.opencode
lintCommand: bun run lint
```

**What changed:**

- `defaultAgent` → `agent`
- `models.claude` → `claude.model`, `models.opencode` → `opencode.model`
- Phase keys (`prd`, `implement`, `review`, etc.) move into the default agent's `models` block
- `version: 2` added at top level

After auto-migration, the updated v2 config is written back to disk.

## How It Works

hone breaks feature development into 3 phases:

1. **Implement** — AI selects and codes the next task (following dependencies)
2. **Review** — AI checks code quality, tests, and security
3. **Finalize** — AI applies feedback, updates docs, and commits changes

Each `hone run` executes multiple iterations of this cycle automatically.

### File and URL References in PRDs

When creating PRDs, you can reference files and URLs directly in your feature description:

**Local files:**

- `./docs/api-spec.md` - Read project documentation
- `src/components/Button.tsx` - Analyze existing components
- `./database/schema.sql` - Review database structure

**URLs:**

- `https://docs.stripe.com/api` - External API documentation
- `https://www.figma.com/design/123/App` - Design specifications
- `http://localhost:3000/dashboard` - Reference existing pages

The AI agent automatically reads files and fetches web content to generate more accurate PRDs.

### Extending Existing PRDs

Use `hone extend-prd` to add new requirements to existing PRD files:

```bash
hone extend-prd <prd-file> <requirement-description>
```

**Features:**

- **Interactive refinement** - AI asks clarifying questions to improve requirement quality
- **Automatic task generation** - Creates tasks for new requirements only
- **File/URL support** - Reference local files and URLs in requirement descriptions
- **Collision-free IDs** - Automatically assigns sequential requirement and task IDs
- **Atomic operations** - Safe file updates with rollback on failure

**Examples:**

```bash
# Basic requirement addition
hone extend-prd .plans/prd-user-auth.md "Add password reset functionality"

# Reference existing code for context
hone extend-prd .plans/prd-dashboard.md "Add export functionality similar to ./src/reports/export.ts"

# Use external documentation
hone extend-prd .plans/prd-payment.md "Implement webhooks following https://stripe.com/docs/webhooks"
```

**Configuration:**

Configure the `extendPrd` phase model in `.plans/hone.config.yml`:

```yaml
claude:
  models:
    extendPrd: claude-sonnet-4-6
```

**Interactive Q&A:**

The command runs an interactive session to refine requirements:

- Answer clarifying questions or type "done" to finish
- Questions focus on scope, implementation details, and integration points
- Refined context improves requirement quality and reduces ambiguity

**Output:**

- Updated PRD file with new requirements in appropriate sections
- New tasks added to existing task file (if it exists)
- Atomic file operations ensure data integrity

### Cleaning Up Completed Features

Use `hone prune` to archive completed PRDs and their associated files:

```bash
hone prune               # Archive completed PRDs to .plans/archive/
hone prune --dry-run     # Preview what would be archived without moving files
```

**What gets archived:**

The prune command moves completed PRD triplets to `.plans/archive/`:

- `prd-<feature>.md` - PRD document
- `tasks-<feature>.yml` - Task breakdown
- `progress-<feature>.txt` - Development log

**When PRDs are considered complete:**

PRDs are eligible for archiving when all tasks have status `completed` or `cancelled`.

**Features:**

- **Safe operations** - Atomic file moves prevent partial archiving during interruption
- **Dry-run preview** - See exactly what would be moved before executing
- **Individual error handling** - Failed archives don't stop processing of other PRDs
- **Detailed output** - Clear success messages and operation summaries

**Examples:**

```bash
# Preview what would be archived
hone prune --dry-run

# Archive completed features
hone prune
```

**Output:**

```bash
# Dry-run example
$ hone prune --dry-run
Dry-run mode: Preview of 2 PRDs that would be archived

  Feature: user-auth
    PRD: .plans/prd-user-auth.md
    Tasks: .plans/tasks-user-auth.yml
    Progress: .plans/progress-user-auth.txt

  Feature: dashboard
    PRD: .plans/prd-dashboard.md
    Tasks: .plans/tasks-dashboard.yml
    Progress: .plans/progress-dashboard.txt

Summary: Would move 2 finished PRDs to archive: user-auth, dashboard

Run without --dry-run to execute the archive operation.

# Actual execution
$ hone prune
Archiving 2 completed PRDs...

  [ok] Archived: user-auth
  [ok] Archived: dashboard

Moved 2 finished PRDs to archive: user-auth, dashboard
```

## File Structure

```
project-root/
├── .plans/
│   ├── hone.config.yml            # Configuration
│   ├── prd-<feature>.md           # Requirements
│   ├── tasks-<feature>.yml        # Task breakdown
│   ├── progress-<feature>.txt     # Development log
│   └── archive/                   # Archived completed features
│       ├── prd-<feature>.md
│       ├── tasks-<feature>.yml
│       └── progress-<feature>.txt
├── .agents/                       # Generated documentation (configurable via agentsDocsDir)
│   ├── architecture.md
│   ├── build.md
│   ├── deployment.md
│   ├── languages.md
│   └── testing.md
└── AGENTS.md                      # AI learning notes (links to .agents/ docs)
```

## Troubleshooting

**Agent not found**

```bash
# Install OpenCode
npm install -g @opencode/cli

# Or install Claude Code
# Follow instructions at https://docs.anthropic.com/claude/docs/claude-code
```

**Task fails**

- Failed tasks remain pending and retry on next run
- Check `.plans/progress-<feature>.txt` for error details
- Network errors retry automatically (3 attempts)

**extend-prd command issues**

```bash
# PRD file not found
✗ Error: PRD file not found: .plans/prd-feature.md
# Solution: Verify file path and ensure PRD exists

# Invalid PRD format
✗ Error: PRD validation failed: Missing required section: Requirements
# Solution: Ensure PRD has Overview and Requirements sections

# File/URL reference issues
⚠ Warning: Could not fetch content from ./missing-file.md (file not found)
# Solution: Check file paths and network connectivity (warnings don't fail the operation)

# Requirement description too short
✗ Error: Requirement description too short
# Solution: Provide detailed description (at least 10 characters)
```

**prune command issues**

```bash
# No completed PRDs to archive
No completed PRDs found to archive.
# Solution: Complete some tasks first with 'hone run' or check status with 'hone status'

# Plans directory not found
✗ Error: Plans directory not found: /path/to/.plans
# Solution: Run 'hone init' to initialize the project or ensure you're in correct directory

# Permission denied creating archive directory
✗ Error: Permission denied creating archive directory
# Solution: Ensure write permissions to .plans directory

# Individual PRD archiving failures
[error] Failed to archive feature-name: Read-only file system
# Solution: Check file permissions and disk space; use --dry-run to troubleshoot

# File system errors during atomic operations
✗ Error: Cross-device link not permitted
# Solution: Ensure .plans directory is on the same filesystem as temp directory
```

## Contributing

```bash
git clone https://github.com/oskarhane/hone-ai.git
cd hone-ai
bun install
bun test
```

### Development Scripts

```bash
# Format YAML files
bun run format:yaml

# Lint YAML files
bun run lint:yaml

# Check YAML formatting and linting
bun run check:yaml
```

## License

MIT
