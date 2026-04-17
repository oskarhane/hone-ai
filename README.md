# hone-ai

**AI Coding Agent Orchestrator** — Automatically implement features from requirements using AI agents.

Transform feature ideas into working code through autonomous development with human oversight.

![info](.github/info.png)

## Why

When working on long running tasks with agents, their context window fills up and the performance degrades. To mitigate this, hone-ai provides a solution starting each new iteration with a fresh context window just passing in a summary of the progress made so far on the specific PRD, repository architecture and gotchas, and any other relevant information.

Everything else is stripped away, leaving only the essential information needed for the next iteration. This approach helps maintain optimal performance and reduces the likelihood of context drift.

It's a surprisingly powerful process.

## Quick Start

Install hone as a native [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) plugin:

```
/plugin marketplace add oskarhane/hone-ai
/plugin install hone@hone-ai
```

To update:

```
/plugin marketplace update hone-ai
```

That's it! You're ready to use hone.

## Common Workflow

```
# 1. Generate project documentation (if no AGENTS.md exists). A one time thing.
/hone:agents-md

# 2. Create a PRD from your feature description
/hone:prd "Add user login with email and password"

# 3. Manually review the generated PRD
#    Edit .plans/prd-user-login.md as needed

# 4. Generate tasks from the PRD
/hone:prd-to-tasks .plans/prd-user-login.md

# 5. (Optional) Extend PRD with additional requirements
/hone:extend-prd .plans/prd-user-login.md "Add two-factor authentication"

# 6. Implement the feature
/hone:run .plans/tasks-user-login.yml -i 10

# 7. Archive completed features (optional)
/hone:prune
```

hone will implement the feature, run tests, and commit changes automatically.

## Skills

All skills are invoked via `/hone:<skill-name>`.

### Workflow

| Skill                | Description                            | Example                                                |
| -------------------- | -------------------------------------- | ------------------------------------------------------ |
| `/hone:agents-md`    | Generate AGENTS.md project docs        | `/hone:agents-md --overwrite`                          |
| `/hone:prd`          | Generate PRD from feature description  | `/hone:prd "Add user authentication"`                  |
| `/hone:prd-to-tasks` | Generate task YAML from PRD            | `/hone:prd-to-tasks .plans/prd-user-auth.md`           |
| `/hone:extend-prd`   | Add requirements to existing PRD       | `/hone:extend-prd .plans/prd-user-auth.md "Add OAuth"` |
| `/hone:run`          | Execute implement/review/finalize loop | `/hone:run .plans/tasks-user-auth.yml -i 5`            |

### Info

| Skill          | Description                                     |
| -------------- | ----------------------------------------------- |
| `/hone:status` | Show incomplete task lists with progress        |
| `/hone:prds`   | List all PRDs with status                       |
| `/hone:prune`  | Archive completed PRDs (`--dry-run` to preview) |

## Concepts

### A Feature

A feature has three files:

- `prd-<feature>.md` - Feature description, goals, non-goals, and acceptance criteria.
- `tasks-<feature>.yml` - A task breakdown of the prd. Description, status, dependencies, and most important, acceptance criteria for each task.
- `progress-<feature>.txt` - A continuously updated progress report on description of what has been done, choices made for each **task** etc.

To create a feature, use `/hone:prd "<description or link or file>"`.
To break down a PRD into tasks, use `/hone:prd-to-tasks .plans/prd-<feature>.md`.

### Implementation loop

The implementation loop is a continuous process of iterating over the tasks in a feature's `tasks-<feature>.yml` file.
This is the most important part: every iteration starts with a new agent invocation, i.e. a new agent context.

This also means that you can work some time on a feature, switch to a different feature and get back to the old one without polluting the context or have the agent digress over time.

The agent context is initialized with 3 files (plus directions via the prompt):

- `tasks-<feature>.yml`
- `progress-<feature>.txt`
- `AGENTS.md` - information on how to run feedback loops in here, extremely important!

The tasks file has a link to the PRD file so the agent knows how to find it if needed.

The Agent decides what task to work on in each iteration of the loop.

Implementation has three stages:

1. **Implementation**: Implement the chosen task. Run feedback loops (type checking, linting, unit testing) before moving forward.
2. **Review**: Have the agent review the implementation (preferably with a different LLM). Run feedback loops (type checking, linting, unit testing) again.
3. **Finalization**: Finalize the implementation with the Agent. Run feedback loops (type checking, linting, unit testing) again. Update the task status in `tasks-<feature>.yml`, write a summary in `progress-<feature>.txt`, and update AGENTS.md with gotchas if necessary.

To work on a feature use `/hone:run .plans/tasks-<feature>.yml -i <iterations>`.

#### The power of the loop

The real benefits of having this implementation loop with a very focused and on point agent context each iteration is that the agents don't get distracted or digress over time. After each task, everything is cleaned up and ready to be picked up at any time without having to look for old chat threads to find important information needed for the implementation.

> **The focused context combined with clear task acceptance criteria and running feedback loops (linting, testing etc.) in each step is key**.

This usually takes you to a good 90% of a completely finished feature (depending on the size/complexity, often it takes you 100%) and if needed you'd use the agent directly a bit back and forth to get all the way.

#### Extending PRDs and editing tasks

You can at any time manually add new tasks in the tasks file for a feature. Just add them in the same format as the rest and set their status to `pending` and the agent will get to them.

If you want to add something larger to an existing feature and don't fancy writing a lot of tasks yourself you can extend a PRD and have the agent create new tasks in the existing tasks file. `/hone:extend-prd .plans/prd-<feature>.md "<added scope description>"`.

## How It Works

hone breaks feature development into 3 phases:

1. **Implement** — AI selects and codes the next task (following dependencies)
2. **Review** — AI checks code quality, tests, and security
3. **Finalize** — AI applies feedback, updates docs, and commits changes

Each `/hone:run` iteration executes this cycle. Unlike external CLI tools, the plugin runs everything natively inside Claude Code — no subprocess overhead.

### File and URL References in PRDs

When creating PRDs, you can reference files and URLs directly in your feature description:

**Local files:**

- `./docs/api-spec.md` - Read project documentation
- `src/components/Button.tsx` - Analyze existing components
- `./database/schema.sql` - Review database structure

**URLs:**

- `https://docs.stripe.com/api` - External API documentation
- `https://www.figma.com/design/123/App` - Design specifications

The AI agent automatically reads files and fetches web content to generate more accurate PRDs.

### Extending Existing PRDs

Use `/hone:extend-prd` to add new requirements to existing PRD files:

```
/hone:extend-prd <prd-file> <requirement-description>
```

**Features:**

- **Interactive refinement** - AI asks clarifying questions to improve requirement quality
- **Automatic task generation** - Creates tasks for new requirements only
- **File/URL support** - Reference local files and URLs in requirement descriptions
- **Collision-free IDs** - Automatically assigns sequential requirement and task IDs
- **Atomic operations** - Safe file updates with rollback on failure

**Examples:**

```
/hone:extend-prd .plans/prd-user-auth.md "Add password reset functionality"
/hone:extend-prd .plans/prd-dashboard.md "Add export functionality similar to ./src/reports/export.ts"
/hone:extend-prd .plans/prd-payment.md "Implement webhooks following https://stripe.com/docs/webhooks"
```

### Cleaning Up Completed Features

Use `/hone:prune` to archive completed PRDs and their associated files:

```
/hone:prune               # Archive completed PRDs to .plans/archive/
/hone:prune --dry-run     # Preview what would be archived without moving files
```

**What gets archived:**

The prune command moves completed PRD triplets to `.plans/archive/`:

- `prd-<feature>.md` - PRD document
- `tasks-<feature>.yml` - Task breakdown
- `progress-<feature>.txt` - Development log

PRDs are eligible for archiving when all tasks have status `completed` or `cancelled`.

## File Structure

```
project-root/
├── .plans/
│   ├── prd-<feature>.md           # Requirements
│   ├── tasks-<feature>.yml        # Task breakdown
│   ├── progress-<feature>.txt     # Development log
│   └── archive/                   # Archived completed features
└── AGENTS.md                      # AI learning notes and feedback commands
```

## Claude Code Permissions

To allow Claude Code to run without prompting for every action, add permissions to `.claude/settings.json` (project-level) or `.claude/settings.local.json` (personal, gitignored):

```json
{
  "permissions": {
    "allow": ["Read", "Edit", "Write", "Bash(git *)"]
  }
}
```

## Troubleshooting

**Task fails**

- Failed tasks remain pending and retry on next run
- Check `.plans/progress-<feature>.txt` for error details

## Contributing

Contributions welcome! See [claude-plugin/README.md](claude-plugin/README.md) for plugin development details.

## License

MIT
