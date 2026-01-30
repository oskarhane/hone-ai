import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { generateAgentsMd } from './agents-md-generator'

// Mock console functions
const originalLog = console.log
const originalError = console.error
let logCalls: string[] = []
let errorCalls: string[] = []

beforeEach(() => {
  // Reset call tracking
  logCalls = []
  errorCalls = []

  // Mock console functions
  console.log = mock((message: string) => {
    logCalls.push(message)
  })

  console.error = mock((message: string) => {
    errorCalls.push(message)
  })
})

// Restore console functions after all tests
process.on('exit', () => {
  console.log = originalLog
  console.error = originalError
})

describe('agents-md-generator', () => {
  test('generateAgentsMd executes without errors', async () => {
    await expect(generateAgentsMd()).resolves.toBeUndefined()
  })

  test('generateAgentsMd outputs expected development messages', async () => {
    await generateAgentsMd()

    expect(logCalls).toContain('Generating AGENTS.md documentation...')
    expect(logCalls).toContain('AGENTS.md generation functionality is under development')
    expect(logCalls).toContain('This command structure is ready for full implementation')
  })

  test('generateAgentsMd handles errors gracefully', async () => {
    // Mock console.log to throw an error
    console.log = mock(() => {
      throw new Error('Test error')
    })

    await expect(generateAgentsMd()).rejects.toThrow('Test error')
  })
})
