# hone - Claude Code Plugin

AI Coding Agent Orchestrator as a native Claude Code plugin. Run the full hone workflow (PRD → tasks → run → review → fix) directly inside Claude Code without spawning external processes.

## Install

Add the marketplace and install the plugin:

```
/plugin marketplace add oskarhane/hone-ai
/plugin install hone@hone-ai
```

To update to the latest version:

```
/plugin marketplace update hone-ai
```

To test locally during development:

```bash
claude --plugin-dir ./claude-plugin
```

## Skills

All skills are invoked via `/hone:<skill-name>`.

### Workflow

| Skill                | Description                                                                       | Example                                                          |
| -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/hone:auto`         | Run the full chain (prd→tasks→run→review→fix) hands-free                          | `/hone:auto "Add user authentication"`                           |
| `/hone:agents-md`    | Generate AGENTS.md project docs                                                   | `/hone:agents-md --overwrite`                                    |
| `/hone:prd`          | Generate PRD from feature description                                             | `/hone:prd "Add user authentication"`                            |
| `/hone:prd-to-tasks` | Generate task YAML from PRD                                                       | `/hone:prd-to-tasks .plans/prd-user-auth.md`                     |
| `/hone:extend-prd`   | Add requirements to existing PRD                                                  | `/hone:extend-prd .plans/prd-user-auth.md "Add OAuth"`           |
| `/hone:run`          | Execute implement/review/finalize loop                                            | `/hone:run .plans/tasks-user-auth.yml -i 5`                      |
| `/hone:review`       | Strict end-of-feature audit of the branch                                         | `/hone:review`                                                   |
| `/hone:fix`          | Turn supplied issues (or "the above" from a prior review) into tasks and run them | `/hone:fix .plans/tasks-user-auth.yml the above blocking issues` |
| `/hone:pr`           | Push the branch, open a PR, monitor CI checks, and auto-fix failures              | `/hone:pr .plans/tasks-user-auth.yml`                            |

### Info

| Skill          | Description                                     |
| -------------- | ----------------------------------------------- |
| `/hone:status` | Show incomplete task lists with progress        |
| `/hone:prds`   | List all PRDs with status                       |
| `/hone:prune`  | Archive completed PRDs (`--dry-run` to preview) |

## Common Workflow

Hands-free — one command runs prd→tasks→run→review→fix, asking batched questions once up front:

```
/hone:auto "Add user login with email and password"
```

Or step through each phase manually:

```
/hone:agents-md
/hone:prd "Add user login with email and password"
# Review .plans/prd-user-login.md
/hone:prd-to-tasks .plans/prd-user-login.md
/hone:run .plans/tasks-user-login.yml -i 10
/hone:review
/hone:fix .plans/tasks-user-login.yml the above blocking issues
/hone:prune
```

## How It Works

Unlike the hone CLI (which spawns `claude -p` as subprocesses), this plugin runs everything natively inside Claude Code:

- **PRD generation**: Claude asks clarifying questions directly in conversation
- **Task generation**: Claude analyzes the PRD and produces task YAML
- **Run loop**: Each iteration launches a forked Agent that implements a task, gets it reviewed, and commits — all without subprocess overhead
- **AGENTS.md**: The source of truth for feedback commands (test, build, lint, format) — read at the start of every iteration

## File Structure

```
.plans/
├── prd-<feature>.md         # PRD documents
├── tasks-<feature>.yml      # Task breakdowns
├── progress-<feature>.txt   # Development logs
└── archive/                 # Completed features
AGENTS.md                    # Project docs and feedback commands
```
