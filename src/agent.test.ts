import { describe, test, expect } from 'bun:test'
import { isAgentAvailable, buildModelArg } from './agent.js'

describe('Agent utilities', () => {
  describe('isAgentAvailable', () => {
    test('should check if claude is available', async () => {
      const available = await isAgentAvailable('claude')
      expect(typeof available).toBe('boolean')
    })

    test('should check if opencode is available', async () => {
      const available = await isAgentAvailable('opencode')
      expect(typeof available).toBe('boolean')
    })
  })

  describe('buildModelArg - model parameter handling', () => {
    describe('opencode agent', () => {
      test('should prepend anthropic/ to legacy Claude models', () => {
        const result = buildModelArg('opencode', 'claude-sonnet-4-20250514')
        expect(result).toBe('anthropic/claude-sonnet-4-20250514')
      })

      test('should use OpenAI model as-is', () => {
        const result = buildModelArg('opencode', 'openai/gpt-4o')
        expect(result).toBe('openai/gpt-4o')
      })

      test('should use Google model as-is', () => {
        const result = buildModelArg('opencode', 'google/gemini-pro')
        expect(result).toBe('google/gemini-pro')
      })

      test('should use Anthropic-prefixed model as-is', () => {
        const result = buildModelArg('opencode', 'anthropic/claude-sonnet-4')
        expect(result).toBe('anthropic/claude-sonnet-4')
      })

      test('should return undefined when model is undefined', () => {
        const result = buildModelArg('opencode', undefined)
        expect(result).toBeUndefined()
      })

      test('should handle complex model names with dots and hyphens', () => {
        const result = buildModelArg('opencode', 'openai/gpt-5.2-codex')
        expect(result).toBe('openai/gpt-5.2-codex')
      })
    })

    describe('claude agent', () => {
      test('should pass legacy Claude model unchanged', () => {
        const result = buildModelArg('claude', 'claude-sonnet-4-20250514')
        expect(result).toBe('claude-sonnet-4-20250514')
      })

      test('should pass OpenAI model unchanged', () => {
        const result = buildModelArg('claude', 'openai/gpt-4o')
        expect(result).toBe('openai/gpt-4o')
      })

      test('should pass Google model unchanged', () => {
        const result = buildModelArg('claude', 'google/gemini-pro')
        expect(result).toBe('google/gemini-pro')
      })

      test('should pass Anthropic-prefixed model unchanged', () => {
        const result = buildModelArg('claude', 'anthropic/claude-sonnet-4')
        expect(result).toBe('anthropic/claude-sonnet-4')
      })

      test('should return undefined when model is undefined', () => {
        const result = buildModelArg('claude', undefined)
        expect(result).toBeUndefined()
      })
    })
  })
})
