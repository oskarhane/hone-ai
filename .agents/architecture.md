# Architecture

Claude Code plugin with markdown-based skills.

- Each skill is a `SKILL.md` file with YAML frontmatter + step-by-step instructions
- `hone-reviewer` agent is a markdown prompt launched as a subagent during `/hone:run`
- `.plans/` directory holds per-feature PRDs, task YAML, progress logs, and config
- Plugin metadata in `claude-plugin/.claude-plugin/plugin.json`
