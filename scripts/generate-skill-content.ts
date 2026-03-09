#!/usr/bin/env bun
/**
 * Generates src/skill-content.ts from skills/hone/SKILL.md
 * Run before publishing to ensure embedded content is up to date
 */
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const skillPath = join(import.meta.dir, '..', 'skills', 'hone', 'SKILL.md')
const outputPath = join(import.meta.dir, '..', 'src', 'skill-content.ts')

const skillContent = await readFile(skillPath, 'utf-8')

const output = `// Auto-generated from skills/hone/SKILL.md by scripts/generate-skill-content.ts
// DO NOT EDIT - run 'bun run generate:skill' to regenerate

export const SKILL_CONTENT = ${JSON.stringify(skillContent)}
`

await writeFile(outputPath, output, 'utf-8')
console.log('✓ Generated src/skill-content.ts from skills/hone/SKILL.md')
