import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { executeTasks } from './run'

// Mock the isAgentAvailable function to avoid CI environment issues
import * as agentModule from './agent'

// Set test environment
const originalEnv = process.env.BUN_ENV
beforeAll(() => {
  process.env.BUN_ENV = 'test'
})
afterAll(() => {
  process.env.BUN_ENV = originalEnv
})

describe('run module', () => {
  const testWorkspace = join(process.cwd(), '.test-workspace-run')
  const plansDir = join(testWorkspace, '.plans')

  beforeEach(() => {
    // Create test workspace
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true })
    }
    mkdirSync(plansDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true })
    }
    // Restore mocks
    mock.restore()
  })

  describe('executeTasks', () => {
    it('should reject when tasks file does not exist', async () => {
      // Mock isAgentAvailable to return true so we test file validation logic
      mock.module('./agent', () => ({
        ...agentModule,
        isAgentAvailable: mock(() => Promise.resolve(true)),
      }))

      await expect(
        executeTasks({
          tasksFile: join(plansDir, 'tasks-nonexistent.yml'),
          iterations: 1,
          agent: 'claude',
        })
      ).rejects.toThrow('File not found')
    })

    it('should reject when iterations is not a positive integer', async () => {
      // Mock isAgentAvailable to return true so we test iterations validation logic
      mock.module('./agent', () => ({
        ...agentModule,
        isAgentAvailable: mock(() => Promise.resolve(true)),
      }))

      const tasksFile = join(plansDir, 'tasks-test.yml')
      writeFileSync(tasksFile, 'feature: test\ntasks: []')

      await expect(
        executeTasks({
          tasksFile,
          iterations: 0,
          agent: 'claude',
        })
      ).rejects.toThrow('Iterations must be a positive integer')

      await expect(
        executeTasks({
          tasksFile,
          iterations: -5,
          agent: 'claude',
        })
      ).rejects.toThrow('Iterations must be a positive integer')
    })

    it('should reject when feature name cannot be extracted from file path', async () => {
      // Mock isAgentAvailable to return true so we test feature name extraction logic
      mock.module('./agent', () => ({
        ...agentModule,
        isAgentAvailable: mock(() => Promise.resolve(true)),
      }))

      const tasksFile = join(plansDir, 'invalid-name.yml')
      writeFileSync(tasksFile, 'feature: test\ntasks: []')

      await expect(
        executeTasks({
          tasksFile,
          iterations: 1,
          agent: 'claude',
        })
      ).rejects.toThrow('Could not extract feature name')
    })

    // Note: We don't test actual agent spawning here since that would require
    // mocking the agent or having an interactive agent available, which would
    // hang in tests. Integration tests would cover the full workflow.
    // The remaining logic (file name extraction, loop structure, phase execution)
    // is covered by the acceptance criteria and can be manually verified.
  })
})
