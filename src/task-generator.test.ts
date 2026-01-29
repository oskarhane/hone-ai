import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from 'bun:test'
import { generateTasksFromPRD } from './task-generator'
import { writeFile, mkdir, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// Set test environment
const originalEnv = process.env.BUN_ENV
beforeAll(() => {
  process.env.BUN_ENV = 'test'
})
afterAll(() => {
  process.env.BUN_ENV = originalEnv
})

const TEST_WORKSPACE = join(process.cwd(), '.test-task-generator')
const TEST_PLANS_DIR = join(TEST_WORKSPACE, '.plans')

describe('task-generator', () => {
  beforeEach(async () => {
    // Mock AgentClient to avoid real API calls
    mock.module('./agent-client', () => ({
      AgentClient: function () {
        return {
          messages: {
            create: mock().mockResolvedValue({
              content: [
                {
                  type: 'text',
                  text: JSON.stringify([
                    {
                      id: 'task-001',
                      title: 'Test task',
                      description: 'Test task description',
                      status: 'pending',
                      dependencies: [],
                      acceptance_criteria: ['Task works'],
                      completed_at: null,
                    },
                  ]),
                },
              ],
            }),
          },
        }
      },
    }))

    // Increase timeout to handle directory operations
    // Create test workspace
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true, force: true })
    }
    await mkdir(TEST_WORKSPACE, { recursive: true })
    await mkdir(TEST_PLANS_DIR, { recursive: true })

    // Change to test workspace
    process.chdir(TEST_WORKSPACE)
  })

  afterEach(async () => {
    // Restore mocks
    mock.restore()

    // Restore original directory and cleanup
    process.chdir(join(TEST_WORKSPACE, '..'))
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true, force: true })
    }
  })

  test('throws error if PRD file does not exist', async () => {
    const nonExistentPath = join(TEST_PLANS_DIR, 'prd-nonexistent.md')

    await expect(generateTasksFromPRD(nonExistentPath)).rejects.toThrow('File not found')
  })

  test('throws error if PRD filename format is invalid', async () => {
    const invalidPath = join(TEST_PLANS_DIR, 'invalid-filename.md')
    await writeFile(invalidPath, '# Test PRD', 'utf-8')

    await expect(generateTasksFromPRD(invalidPath)).rejects.toThrow('Invalid PRD filename format')
  })

  test('throws error if PRD filename has no feature name', async () => {
    const invalidPath = join(TEST_PLANS_DIR, 'prd-.md')
    await writeFile(invalidPath, '# Test PRD', 'utf-8')

    await expect(generateTasksFromPRD(invalidPath)).rejects.toThrow('Invalid PRD filename format')
  })

  test('extracts feature name correctly from PRD filename', async () => {
    const prdPath = join(TEST_PLANS_DIR, 'prd-test-feature.md')
    const prdContent = `# PRD: Test Feature
    
## Overview
Simple test feature for unit testing.

## Requirements
- REQ-1: Basic requirement
`

    await writeFile(prdPath, prdContent, 'utf-8')

    // With AgentClient mocked, this should succeed and create the tasks file
    const result = await generateTasksFromPRD(prdPath)

    // Verify the feature name was correctly extracted from the filename
    expect(result).toBe('tasks-test-feature.yml')

    // Verify the tasks file was created with correct content
    const tasksFilePath = join(process.cwd(), '.plans', 'tasks-test-feature.yml')
    expect(existsSync(tasksFilePath)).toBe(true)

    // Read and verify the content contains the correct feature name
    const tasksContent = await readFile(tasksFilePath, 'utf-8')
    expect(tasksContent).toContain('feature: test-feature')
    expect(tasksContent).toContain('prd: ./prd-test-feature.md')
  })
})
