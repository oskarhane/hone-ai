import { describe, test, expect } from 'bun:test'
import { AgentClient } from './agent-client'

describe('AgentClient', () => {
  describe('constructor', () => {
    test('creates client with minimal config', () => {
      const client = new AgentClient({
        agent: 'opencode',
        model: 'claude-sonnet-4-20250514',
      })

      expect(client).toBeDefined()
      expect(client.messages).toBeDefined()
      expect(typeof client.messages.create).toBe('function')
    })

    test('creates client with full config', () => {
      const client = new AgentClient({
        agent: 'claude',
        model: 'claude-opus-4-20250514',
        workingDir: '/custom/path',
      })

      expect(client).toBeDefined()
      expect(client.messages).toBeDefined()
    })
  })

  describe('messages API', () => {
    test('provides messages.create method', () => {
      const client = new AgentClient({
        agent: 'opencode',
        model: 'claude-sonnet-4-20250514',
      })

      expect(client.messages.create).toBeDefined()
      expect(typeof client.messages.create).toBe('function')
    })
  })

  // Note: Integration tests with actual agent spawning would test:
  // - Prompt construction with system messages
  // - Model parameter passing to spawnAgent
  // - Response parsing from stdout
  // - Error handling for non-zero exit codes
  // - Retry logic with retryWithBackoff
  // These are covered in integration tests that mock child_process
})
