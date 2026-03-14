# AGENTS.md

Patterns and instructions for AI agents working on this repo.

## Feedback Instructions

FORMAT COMMANDS: [`bun run format` - prettier on all md/yml/yaml files]

No build, test, or lint commands. This is a markdown/YAML-only project.

## Project Overview

hone-ai is a Claude Code plugin that orchestrates AI agents to implement features from PRDs. Distributed exclusively as a Claude Code plugin (no CLI, no compiled code).

PRIMARY LANGUAGES: [Markdown, YAML]

## Project Structure

```
claude-plugin/                 # The plugin (installed via Claude Code marketplace)
├── .claude-plugin/
│   └── plugin.json            # Plugin metadata (name, version, description)
├── agents/
│   └── hone-reviewer.md       # Code review agent for implementation loop
├── skills/                    # Slash command skills (/hone:<skill>)
│   ├── agents-md/SKILL.md     # Generate AGENTS.md project docs
│   ├── extend-prd/SKILL.md    # Add requirements to existing PRD
│   ├── init/SKILL.md          # Initialize hone in a project
│   ├── prd/SKILL.md           # Generate PRD from feature description
│   ├── prd-to-tasks/SKILL.md  # Convert PRD to task YAML
│   ├── prds/SKILL.md          # List all PRDs with status
│   ├── prune/SKILL.md         # Archive completed PRDs
│   ├── run/SKILL.md           # Execute implement/review/finalize loop
│   └── status/SKILL.md        # Show incomplete tasks with progress
└── README.md                  # Plugin docs and install instructions
.plans/                        # Workspace for PRDs, tasks, config, progress logs
AGENTS.md                      # This file
package.json                   # Metadata + prettier only
.prettierrc.yml                # Prettier config
```

## Skills

Workflow: `init`, `agents-md`, `prd`, `prd-to-tasks`, `extend-prd`, `run`
Info: `status`, `prds`, `prune`

Skills are markdown files (SKILL.md) with YAML frontmatter. Each defines a step-by-step instruction set for Claude Code to execute as a slash command.

## Agents

**hone-reviewer** (`claude-plugin/agents/hone-reviewer.md`): Code review agent launched as a subagent during the review phase of `/hone:run`. Reviews git diff for correctness, tests, security, performance, edge cases, and codebase conventions.

## Configuration

Project config lives in `.plans/hone.config.yml`. Supports model overrides per phase and agent selection (claude/opencode).

## Conventions

- All plugin content is plain markdown/YAML; no compiled or transpiled code
- Skills follow a consistent pattern: YAML frontmatter with description, then step-by-step instructions
- PRDs go in `.plans/prd-<feature>.md`, tasks in `.plans/tasks-<feature>.yml`
- Progress logs in `.plans/progress-<feature>.txt`
- Run `bun run format` before committing to ensure consistent formatting
