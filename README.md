# hone-ai

**AI Coding Agent Orchestrator** — Automatically implement features from requirements using AI agents.

Transform feature ideas into working code through autonomous development with human oversight.

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

# 5. Implement the feature
hone run .plans/tasks-user-login.yml -i 10
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

## Commands

### Create and implement a feature

```bash
hone agents-md                              # Generate AGENTS.md (first time only)
hone prd "Feature description"              # Generate requirements
# Review .plans/prd-<feature>.md manually
hone prd-to-tasks .plans/prd-feature.md     # Generate tasks
hone run .plans/tasks-feature.yml -i 10     # Implement tasks
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

### Advanced options

```bash
hone run tasks.yml -i 3 --agent opencode   # Use specific agent
hone run tasks.yml -i 5 --skip=review      # Skip code review
```

## Configuration

Edit `.plans/hone.config.yml` to customize models and test commands:

```yaml
defaultAgent: claude
models:
  opencode: claude-sonnet-4-20250514
  claude: claude-sonnet-4-20250514
```

**Advanced model configuration:**

- Use phase-specific models (prd, implement, review, finalize)
- Model names need full version: `claude-sonnet-4-YYYYMMDD`
- Check available models: `opencode --help` or `claude --help`

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

## File Structure

```
project-root/
├── .plans/
│   ├── hone.config.yml            # Configuration
│   ├── prd-<feature>.md           # Requirements
│   ├── tasks-<feature>.yml        # Task breakdown
│   └── progress-<feature>.txt     # Development log
└── AGENTS.md                      # AI learning notes
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
