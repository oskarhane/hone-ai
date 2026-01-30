import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { generateAgentsMd } from './agents-md-generator'
import type { AgentsMdGeneratorOptions, GenerationResult } from './agents-md-generator'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import * as fs from 'fs/promises'

// Mock AgentClient
import { AgentClient } from './agent-client'

const mockAgentResponse = {
  content: [
    {
      type: 'text' as const,
      text: 'PRIMARY LANGUAGES: JavaScript, TypeScript\nUSAGE CONTEXT: TypeScript for main application code, JavaScript for configuration files',
    },
  ],
}

const mockAgentClient = {
  messages: {
    create: mock(async () => mockAgentResponse),
  },
}

// Mock the AgentClient constructor
mock.module('./agent-client', () => ({
  AgentClient: mock(() => mockAgentClient),
}))

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

  test('generateAgentsMd creates .agents/ directory when content exceeds 100 lines', async () => {
    // Mock a response that will generate a very long output
    const longMockResponse = {
      content: [
        {
          type: 'text' as const,
          text:
            'PRIMARY LANGUAGES: JavaScript, TypeScript, Python, Java, Go, Rust, PHP, Ruby, C++, C#, Swift, Kotlin, Scala, Clojure, Elixir, Erlang, Haskell, OCaml, F#, R, MATLAB, Lua, Perl, Shell\n'.repeat(
              20
            ) +
            'This is a very detailed analysis that will definitely exceed the 100-line limit when combined with other sections. ' +
            'It includes extensive information about the project structure, dependencies, build systems, testing frameworks, and deployment strategies. ' +
            'The content is intentionally verbose to trigger the .agents/ subdirectory creation logic.',
        },
      ],
    }

    // Mock agent client to return long content
    const longMockAgentClient = {
      messages: {
        create: mock(async () => longMockResponse),
      },
    }

    // Replace the mock temporarily
    const originalMock = mockAgentClient.messages.create
    mockAgentClient.messages.create = longMockAgentClient.messages.create

    const result = await generateAgentsMd()

    // Restore original mock
    mockAgentClient.messages.create = originalMock

    expect(result.success).toBe(true)

    // Check if .agents/ directory was created
    if (result.agentsDirPath) {
      expect(existsSync(result.agentsDirPath)).toBe(true)
      expect(result.filesCreated.length).toBeGreaterThan(1) // Main file + detail files
      expect(logCalls.some(msg => msg.includes('exceeds 100-line limit'))).toBe(true)
      expect(logCalls.some(msg => msg.includes('Created .agents/'))).toBe(true)
    }
  })

  test('generateAgentsMd creates compact content with references when using .agents/ directory', async () => {
    // Create a package.json with many dependencies to ensure we have content
    await fs.writeFile(
      'package.json',
      JSON.stringify({
        name: 'test-project',
        scripts: { build: 'tsc', test: 'jest' },
        dependencies: {
          react: '^18.0.0',
          typescript: '^5.0.0',
          jest: '^29.0.0',
          express: '^4.18.0',
        },
      }),
      'utf-8'
    )

    const result = await generateAgentsMd()
    expect(result.success).toBe(true)

    if (result.mainFilePath) {
      const content = await fs.readFile(result.mainFilePath, 'utf-8')

      // Should contain section headers
      expect(content).toContain('## Project Overview')
      expect(content).toContain('## Build System')

      // If .agents/ directory was used, should contain references
      if (result.agentsDirPath && existsSync(result.agentsDirPath)) {
        expect(content).toContain('.agents/')
        expect(content).toContain('for detailed information')

        // Check that detail files were created
        const detailFiles = ['languages.md', 'build.md']
        for (const file of detailFiles) {
          const detailPath = join(result.agentsDirPath, file)
          if (existsSync(detailPath)) {
            const detailContent = await fs.readFile(detailPath, 'utf-8')
            expect(detailContent).toContain('# ')
            expect(detailContent).toContain('part of the AGENTS.md documentation system')
          }
        }
      }
    }
  })

  test('generateAgentsMd handles project with TypeScript configuration', async () => {
    // Create TypeScript project files
    await fs.writeFile(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true,
        },
      }),
      'utf-8'
    )

    await fs.writeFile(
      'package.json',
      JSON.stringify({
        name: 'typescript-project',
        scripts: { build: 'tsc' },
        devDependencies: {
          typescript: '^5.0.0',
        },
      }),
      'utf-8'
    )

    const result = await generateAgentsMd()
    expect(result.success).toBe(true)

    if (result.mainFilePath) {
      const content = await fs.readFile(result.mainFilePath, 'utf-8')
      expect(content).toContain('## Project Overview')
      expect(content).toContain('## Build System')
    }
  })
})
