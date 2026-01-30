import { describe, it, expect } from 'bun:test'
import { slugify } from './prd-generator'

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
