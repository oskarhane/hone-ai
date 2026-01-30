import { describe, test, expect } from 'bun:test'
import { isAgentAvailable } from './agent'

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

  describe('spawnAgent', () => {
    // Note: spawnAgent tests require actual agent binaries to be installed
    // and would spawn interactive processes. Testing is done manually or via
    // integration tests with mocked child_process.
    test('should export spawnAgent function', () => {
      const { spawnAgent } = require('./agent')
      expect(typeof spawnAgent).toBe('function')
    })
  })
})
