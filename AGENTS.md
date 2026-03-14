<!-- BEGIN GENERATED: AGENTS-MD -->

# AGENTS.md

Learnings and patterns for future agents working on this project.

## Feedback Instructions

TEST COMMANDS: [none]
BUILD COMMANDS: [none]
LINT COMMANDS: [none]
FORMAT COMMANDS: [`bun run format` — prettier on all md/yml files]

No build, test, or lint commands. This is a markdown/YAML-only project.

## Project Overview

PRIMARY LANGUAGES: [Markdown, YAML]

hone-ai is a Claude Code plugin that orchestrates AI agents to implement features from PRDs. Distributed exclusively via the Claude Code plugin marketplace — no CLI, no compiled code.

## Build System

BUILD SYSTEMS: [Bun (dependency management + script runner only)]

Bun is used solely for `bun install` (prettier dep) and `bun run format`. No compilation or bundling.

## Testing Framework

TESTING FRAMEWORKS: [none]

No tests. All plugin content is plain markdown/YAML executed by Claude Code.

## Architecture

ARCHITECTURE PATTERN: Claude Code plugin with markdown skills

```
claude-plugin/                 # The plugin
├── .claude-plugin/
│   └── plugin.json            # Plugin metadata (name, version, description)
├── agents/
│   └── hone-reviewer.md       # Code review agent for implementation loop
├── skills/                    # Slash command skills (/hone:<skill>)
│   ├── agents-md/SKILL.md
│   ├── extend-prd/SKILL.md
│   ├── init/SKILL.md
│   ├── prd/SKILL.md
│   ├── prd-to-tasks/SKILL.md
│   ├── prds/SKILL.md
│   ├── prune/SKILL.md
│   ├── run/SKILL.md
│   └── status/SKILL.md
└── README.md
.plans/                        # PRDs, tasks, config, progress logs
AGENTS.md                      # This file
package.json                   # Metadata + prettier only
.prettierrc.yml                # Prettier config
```

Skills are markdown files (SKILL.md) with YAML frontmatter defining step-by-step instructions for Claude Code.

Workflow skills: `init`, `agents-md`, `prd`, `prd-to-tasks`, `extend-prd`, `run`
Info skills: `status`, `prds`, `prune`

## Deployment

DEPLOYMENT STRATEGY: Claude Code plugin marketplace

Published via `/plugin marketplace`. No npm, no binary releases, no Docker.

## Conventions

- All plugin content is plain markdown/YAML; no compiled or transpiled code
- PRDs: `.plans/prd-<feature>.md`, tasks: `.plans/tasks-<feature>.yml`, progress: `.plans/progress-<feature>.txt`
- Run `bun run format` before committing

---

_This AGENTS.md was generated using agent-based project discovery._

<!-- END GENERATED: AGENTS-MD -->
