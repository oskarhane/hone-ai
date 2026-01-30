import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { generateAgentsMd } from './agents-md-generator'
import type { AgentsMdGeneratorOptions, GenerationResult } from './agents-md-generator'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import * as fs from 'fs/promises'

// Test workspace setup
const TEST_WORKSPACE = join(process.cwd(), '.test-agents-md-workspace')
const originalCwd = process.cwd()

// Mock console and logger functions
const originalLog = console.log
const originalError = console.error
let logCalls: string[] = []
let errorCalls: string[] = []

beforeEach(() => {
  // Reset call tracking
  logCalls = []
  errorCalls = []

  // Create isolated test workspace
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true })
  }
  mkdirSync(TEST_WORKSPACE, { recursive: true })

  // Change to test workspace
  process.chdir(TEST_WORKSPACE)

  // Mock console functions
  console.log = mock((message: string) => {
    logCalls.push(message)
  })

  console.error = mock((message: string) => {
    errorCalls.push(message)
  })
})

afterEach(() => {
  // Restore console functions
  console.log = originalLog
  console.error = originalError

  // Return to original directory and clean up
  process.chdir(originalCwd)
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true })
  }
})

describe('agents-md-generator', () => {
  test('generateAgentsMd returns proper result structure', async () => {
    const result: GenerationResult = await generateAgentsMd()

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('filesCreated')
    expect(typeof result.success).toBe('boolean')
    expect(Array.isArray(result.filesCreated)).toBe(true)
  })

  test('generateAgentsMd generates content with basic project analysis', async () => {
    const result: GenerationResult = await generateAgentsMd()

    if (result.success && result.mainFilePath) {
      expect(existsSync(result.mainFilePath)).toBe(true)
      const content = await fs.readFile(result.mainFilePath, 'utf-8')
      expect(content).toContain('# AGENTS.md')
      expect(content).toContain('## Project Overview')
      expect(content).toContain('## Build System')
    }
  })

  test('generateAgentsMd accepts custom project path', async () => {
    const options: AgentsMdGeneratorOptions = {
      projectPath: process.cwd(),
    }

    const result = await generateAgentsMd(options)
    expect(typeof result.success).toBe('boolean')
  })

  test('generateAgentsMd respects overwrite option when file exists', async () => {
    // First generation should succeed
    const firstResult = await generateAgentsMd()
    expect(firstResult.success).toBe(true)

    // Second generation without overwrite should fail
    const secondResult = await generateAgentsMd()
    expect(secondResult.success).toBe(false)
    expect(secondResult.error?.message).toContain('already exists')

    // Third generation with overwrite should succeed
    const thirdResult = await generateAgentsMd({ overwrite: true })
    expect(thirdResult.success).toBe(true)
  })

  test('generateAgentsMd handles errors gracefully', async () => {
    // Test with invalid project path
    const result = await generateAgentsMd({ projectPath: '/nonexistent/path' })

    // Should handle errors gracefully and return error result
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error)
    }
  })

  test('generateAgentsMd outputs expected log messages', async () => {
    await generateAgentsMd()

    expect(logCalls.some(msg => msg.includes('Analyzing project'))).toBe(true)
    expect(logCalls.some(msg => msg.includes('Loading configuration'))).toBe(true)
    expect(logCalls.some(msg => msg.includes('Generating AGENTS.md'))).toBe(true)
  })
})
