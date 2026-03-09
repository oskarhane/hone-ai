import { SKILL_CONTENT } from './skill-content.js'

export async function printSkill(): Promise<void> {
  process.stdout.write('To install the hone skill in Claude Code, copy the skill file to:\n')
  process.stdout.write('  ~/.claude/skills/hone/SKILL.md\n\n')
  process.stdout.write('--- hone SKILL.md ---\n\n')
  process.stdout.write(SKILL_CONTENT)
}
