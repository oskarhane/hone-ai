import { describe, it, expect } from 'bun:test'
import { slugify } from './prd-generator'
import { readFile } from 'fs/promises'
import { join } from 'path'

describe('slugify', () => {
  it('should convert to lowercase', () => {
    expect(slugify('My Feature')).toBe('my-feature')
  })

  it('should replace spaces with hyphens', () => {
    expect(slugify('user authentication system')).toBe('user-authentication-system')
  })

  it('should remove special characters', () => {
    expect(slugify('Feature (with) special! chars@')).toBe('feature-with-special-chars')
  })

  it('should collapse multiple hyphens', () => {
    expect(slugify('feature   with   spaces')).toBe('feature-with-spaces')
  })

  it('should trim to 50 characters', () => {
    const longString = 'this is a very long feature name that exceeds fifty characters'
    const result = slugify(longString)
    expect(result.length).toBeLessThanOrEqual(50)
  })

  it('should handle empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('should trim leading and trailing hyphens', () => {
    expect(slugify('  feature  ')).toBe('feature')
  })
})

describe('PRD system prompts', () => {
  it('should include file and URL processing instructions', async () => {
    const sourceFile = await readFile(join(__dirname, 'prd-generator.ts'), 'utf-8')

    // Verify clarifying questions prompt includes file/URL instructions
    expect(sourceFile).toContain('FILE AND URL PROCESSING:')
    expect(sourceFile).toContain(
      'automatically read and incorporate their content using the Read tool'
    )
    expect(sourceFile).toContain(
      'automatically fetch and incorporate their content using the WebFetch tool'
    )

    // Verify both prompts contain the instructions
    const fileUrlInstructions = sourceFile.match(
      /FILE AND URL PROCESSING:(.*?)(?=\n\n|\nRules:|\nGenerate)/gs
    )
    expect(fileUrlInstructions).toBeTruthy()
    expect(fileUrlInstructions?.length).toBe(2) // One in clarifying questions, one in PRD generation
  })

  it('should include reference access failure handling instructions in clarifying questions', async () => {
    const sourceFile = await readFile(join(__dirname, 'prd-generator.ts'), 'utf-8')

    // Verify specific reference failure handling instructions
    expect(sourceFile).toContain('REFERENCE ACCESS FAILURES: When file reads or URL fetches fail:')
    expect(sourceFile).toContain('Continue with question generation using available context')
    expect(sourceFile).toContain(
      "Ask clarifying questions about the inaccessible reference's intended purpose or relevance"
    )
    expect(sourceFile).toContain(
      "I couldn't access [file/URL]. What was its relevance to this feature?"
    )
    expect(sourceFile).toContain(
      'Prioritize these clarification questions early in the Q&A session when references are critical'
    )
  })
})
