import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { existsSync, rmSync, mkdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { slugify } from './prd-generator'

describe('PRD Generator Integration', () => {
  const testPlansDir = join(process.cwd(), '.plans-test')
  const originalCwd = process.cwd()

  beforeAll(() => {
    // Create test .plans directory
    if (existsSync(testPlansDir)) {
      rmSync(testPlansDir, { recursive: true })
    }
    mkdirSync(testPlansDir, { recursive: true })
  })

  afterAll(() => {
    // Cleanup
    if (existsSync(testPlansDir)) {
      rmSync(testPlansDir, { recursive: true })
    }
  })

  describe('slugify', () => {
    test('converts to lowercase', () => {
      expect(slugify('Email Validation')).toBe('email-validation')
    })

    test('replaces spaces with hyphens', () => {
      expect(slugify('user profile page')).toBe('user-profile-page')
    })

    test('removes special characters', () => {
      expect(slugify('user@email.com validation!')).toBe('useremailcom-validation')
    })

    test('trims leading/trailing spaces', () => {
      expect(slugify('  feature name  ')).toBe('feature-name')
    })

    test('removes leading/trailing hyphens', () => {
      expect(slugify('---feature-name---')).toBe('feature-name')
    })

    test('collapses multiple hyphens', () => {
      expect(slugify('feature--name')).toBe('feature-name')
      expect(slugify('feature---name')).toBe('feature-name')
    })

    test('truncates to 50 characters', () => {
      const longName = 'this-is-a-very-long-feature-name-that-exceeds-fifty-characters'
      const result = slugify(longName)
      expect(result.length).toBeLessThanOrEqual(50)
      expect(result.length).toBe(50)
      expect(result).toBe('this-is-a-very-long-feature-name-that-exceeds-fift')
    })

    test('handles empty string', () => {
      expect(slugify('')).toBe('')
    })

    test('handles string with only special characters', () => {
      expect(slugify('!@#$%^&*()')).toBe('')
    })

    test('handles mixed case with numbers', () => {
      expect(slugify('Feature123Test')).toBe('feature123test')
    })

    test('preserves existing hyphens', () => {
      expect(slugify('my-feature-name')).toBe('my-feature-name')
    })

    test('handles unicode characters', () => {
      expect(slugify('feature café')).toBe('feature-caf')
    })
  })

  describe('Model configuration', () => {
    test('uses correct model name format', async () => {
      const { loadConfig } = await import('./config')
      const config = await loadConfig()

      // Model name should match Anthropic API format
      expect(config.models.claude).toMatch(/^claude-sonnet-4-\d{8}$/)
      expect(config.models.opencode).toMatch(/^claude-sonnet-4-\d{8}$/)
    })
  })
})
