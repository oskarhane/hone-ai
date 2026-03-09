import { describe, expect, test, mock, spyOn, beforeEach, afterEach } from 'bun:test'

describe('printSkill', () => {
  let stdoutOutput: string[]
  let stderrOutput: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    stdoutOutput = []
    stderrOutput = []
    exitCode = undefined

    spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      stdoutOutput.push(typeof data === 'string' ? data : new TextDecoder().decode(data))
      return true
    })
    spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      stderrOutput.push(typeof data === 'string' ? data : new TextDecoder().decode(data))
      return true
    })
    spyOn(process, 'exit').mockImplementation((code?: number) => {
      exitCode = code
      throw new Error(`process.exit(${code})`)
    })
  })

  afterEach(() => {
    mock.restore()
  })

  test('happy path: prints installation instructions and skill content', async () => {
    const fakeSkillContent = '# Fake Skill\n\nThis is a test skill.'

    mock.module('fs/promises', () => ({
      readFile: mock(() => Promise.resolve(fakeSkillContent)),
    }))

    const { printSkill } = await import('./skill.js')
    await printSkill()

    const allOutput = stdoutOutput.join('')
    expect(allOutput).toContain('~/.claude/skills/hone/SKILL.md')
    expect(allOutput).toContain(fakeSkillContent)
  })

  test('ENOENT: falls back to embedded skill content', async () => {
    const enoentError = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })

    mock.module('fs/promises', () => ({
      readFile: mock(() => Promise.reject(enoentError)),
    }))

    const { printSkill } = await import('./skill.js')
    await printSkill()

    const allOutput = stdoutOutput.join('')
    expect(allOutput).toContain('~/.claude/skills/hone/SKILL.md')
    // Embedded fallback contains hone skill content
    expect(allOutput).toContain('# hone Skill')
    expect(exitCode).toBeUndefined()
  })

  test('non-ENOENT error: exits with code 1 and writes to stderr', async () => {
    const accessError = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })

    mock.module('fs/promises', () => ({
      readFile: mock(() => Promise.reject(accessError)),
    }))

    const { printSkill } = await import('./skill.js')

    await expect(printSkill()).rejects.toThrow('process.exit(1)')

    expect(exitCode).toBe(1)
    const allStderr = stderrOutput.join('')
    expect(allStderr).toContain('failed to read skill file')
  })
})
