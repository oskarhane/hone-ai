import { describe, expect, test, spyOn, beforeEach, afterEach } from 'bun:test'
import { printSkill } from './skill.js'

describe('printSkill', () => {
  let stdoutOutput: string[]

  beforeEach(() => {
    stdoutOutput = []

    spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      stdoutOutput.push(typeof data === 'string' ? data : new TextDecoder().decode(data))
      return true
    })
  })

  afterEach(() => {
    // @ts-expect-error - restore is not in the types but exists at runtime
    process.stdout.write.mockRestore?.()
  })

  test('prints installation instructions and bundled skill content', async () => {
    await printSkill()

    const allOutput = stdoutOutput.join('')
    expect(allOutput).toContain('~/.claude/skills/hone/SKILL.md')
    expect(allOutput).toContain('# hone Skill')
    expect(allOutput).toContain('## Core Workflow')
    expect(allOutput).toContain('hone prd')
  })
})
