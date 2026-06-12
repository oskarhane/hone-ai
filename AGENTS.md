# AGENTS.md

Learnings and patterns for future agents working on this project.

## Feedback Instructions

TEST COMMANDS: [none]
BUILD COMMANDS: [none]
LINT COMMANDS: [none]
FORMAT COMMANDS: [`bun run format` — prettier on all md/yml files]

No build, test, or lint commands. This is a markdown/YAML-only project.
Always run `bun run format` before committing.

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
├── agents/                    # Sub-agent definitions (spawned by skills/iterations)
│   ├── hone-reviewer.md       # In-loop per-task review agent
│   └── hone-auditor.md        # End-of-feature maintainability audit agent
├── skills/                    # Slash command skills (/hone:<skill>)
│   ├── agents-md/SKILL.md
│   ├── auto/SKILL.md
│   ├── extend-prd/SKILL.md
│   ├── fix/SKILL.md
│   ├── pr/SKILL.md
│   ├── prd/SKILL.md
│   ├── prd-to-tasks/SKILL.md
│   ├── prds/SKILL.md
│   ├── prune/SKILL.md
│   ├── review/SKILL.md
│   ├── run/SKILL.md
│   └── status/SKILL.md
└── README.md
.plans/                        # PRDs, tasks, config, progress logs
AGENTS.md                      # This file
package.json                   # Metadata + prettier only
.prettierrc.yml                # Prettier config
```

Skills are markdown files (SKILL.md) with YAML frontmatter defining step-by-step instructions for Claude Code.

Workflow skills: `auto`, `agents-md`, `prd`, `prd-to-tasks`, `extend-prd`, `run`, `fix`, `review`, `pr`
Info skills: `status`, `prds`, `prune`

`.plans/` naming: `prd-<feature>.md`, `tasks-<feature>.yml`, `progress-<feature>.txt`.

### Convention: verbatim inline references

Skills reuse logic by inlining sibling SKILL.md files (e.g. `auto` reads `fix`, which reads `run`) rather than copy-pasting steps, keeping a single source of truth (DRY). This is a conscious tradeoff against the Agent Skills "keep references one level deep" guidance, which warns Claude may only partially read nested files. The mitigation is the explicit "re-read that file and follow it verbatim" wording in every inline reference. Future agents MUST preserve that wording and MUST NOT flatten the chain by copy-pasting sub-skill steps.

## Deployment

DEPLOYMENT STRATEGY: Claude Code plugin marketplace

Published via `/plugin marketplace`. No npm, no binary releases, no Docker.

---

_This AGENTS.md was generated using agent-based project discovery._
