import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import {
  generateAgentsMd,
  AGENTS_DOCS_DIR,
  collectConfigMetadataSignals,
  collectWorkflowMetadataSignals,
  collectDocsMetadataSignals,
  collectAgentsDocsMetadataSignals,
  dedupeMetadataSignals,
  isUnavailableAgentResult,
  extractPreservableContent,
  mergeGeneratedContent,
} from './agents-md-generator'
import type {
  AgentsMdGeneratorOptions,
  GenerationResult,
  MetadataSignal,
} from './agents-md-generator'
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

    expect(logCalls.some(msg => msg.includes('Phase 1: Project Analysis'))).toBe(true)
    expect(logCalls.some(msg => msg.includes('✓ Generated AGENTS.md'))).toBe(true)
  })

  test(`generateAgentsMd creates ${AGENTS_DOCS_DIR}/ directory when content exceeds 100 lines`, async () => {
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
            `The content is intentionally verbose to trigger the ${AGENTS_DOCS_DIR}/ subdirectory creation logic.`,
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

    // Check if ${AGENTS_DOCS_DIR}/ directory was created
    if (result.agentsDirPath) {
      expect(existsSync(result.agentsDirPath)).toBe(true)
      expect(result.filesCreated.length).toBeGreaterThan(1) // Main file + detail files
      expect(logCalls.some(msg => msg.includes('exceeds 100-line limit'))).toBe(true)
      expect(logCalls.some(msg => msg.includes('✓ Created') && msg.includes('detail files'))).toBe(
        true
      )
    }
  })

  test(`generateAgentsMd creates compact content with references when using ${AGENTS_DOCS_DIR}/ directory`, async () => {
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

      // If ${AGENTS_DOCS_DIR}/ directory was used, should contain references
      if (result.agentsDirPath && existsSync(result.agentsDirPath)) {
        expect(content).toContain(AGENTS_DOCS_DIR)
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

  test(`generateAgentsMd handles existing ${AGENTS_DOCS_DIR}/ directory properly`, async () => {
    // Create existing ${AGENTS_DOCS_DIR}/ directory with a file
    const agentsDir = join(process.cwd(), AGENTS_DOCS_DIR)
    if (!existsSync(agentsDir)) {
      mkdirSync(agentsDir, { recursive: true })
    }
    await fs.writeFile(join(agentsDir, 'existing.md'), 'Existing content', 'utf-8')

    // First generation without overwrite
    const result1 = await generateAgentsMd()
    expect(result1.success).toBe(true)

    // Second generation with overwrite
    const result2 = await generateAgentsMd({ overwrite: true })
    expect(result2.success).toBe(true)

    // Verify existing file is still there (we don't delete unrelated files)
    expect(existsSync(join(agentsDir, 'existing.md'))).toBe(true)
  })

  test(`generateAgentsMd creates ${AGENTS_DOCS_DIR}/ directory for complex projects`, async () => {
    // Create a project with many sections to trigger ${AGENTS_DOCS_DIR}/ creation
    await fs.writeFile(
      'package.json',
      JSON.stringify({
        name: 'complex-project',
        scripts: {
          build: 'tsc',
          test: 'jest',
          deploy: 'docker build',
          lint: 'eslint',
        },
        dependencies: {
          react: '^18.0.0',
          express: '^4.18.0',
          typescript: '^5.0.0',
          jest: '^29.0.0',
          eslint: '^8.0.0',
          docker: '^1.0.0',
        },
      }),
      'utf-8'
    )

    // Create multiple config files
    await fs.writeFile('Dockerfile', 'FROM node:18', 'utf-8')
    await fs.writeFile('docker-compose.yml', 'version: "3"', 'utf-8')

    const result = await generateAgentsMd()
    expect(result.success).toBe(true)

    // Should trigger ${AGENTS_DOCS_DIR}/ directory creation due to complexity
    if (result.agentsDirPath) {
      expect(existsSync(result.agentsDirPath)).toBe(true)
      expect(result.filesCreated.length).toBeGreaterThan(1)
    }
  })

  test('should generate AGENTS.md without unhelpful agent preambles', async () => {
    // Test that generated AGENTS.md files don't contain "Based on my..." text
    // This validates the fix for task-011/012 where agent preambles were cluttering the output

    // Create minimal test project
    await fs.writeFile('package.json', JSON.stringify({ name: 'test-project' }), 'utf-8')

    const result = await generateAgentsMd({ overwrite: true })
    expect(result.success).toBe(true)

    if (result.success && result.mainFilePath) {
      const content = await fs.readFile(result.mainFilePath, 'utf-8')

      // Verify that unhelpful agent preambles are NOT in the AGENTS.md summary
      // Comprehensive check for all common preamble patterns
      expect(content).not.toMatch(/Based on my analysis.*?here's.*?/i)
      expect(content).not.toMatch(/Based on my architectural analysis.*?/i)
      expect(content).not.toMatch(/Based on my exploration.*?/i)
      expect(content).not.toMatch(/Based on my comprehensive analysis.*?/i)
      expect(content).not.toMatch(/Based on the.*?analysis.*?/i)
      expect(content).not.toMatch(/Here's.*?analysis.*?:/i)
      expect(content).not.toMatch(/Here's what I found.*?:/i)
      expect(content).not.toMatch(/I've analyzed.*?:/i)
      expect(content).not.toMatch(/I'll analyze.*?:/i)
      expect(content).not.toMatch(/Looking at the project.*?:/i)
      expect(content).not.toMatch(/After analyzing.*?:/i)
      expect(content).not.toMatch(/Upon examination.*?:/i)
      expect(content).not.toMatch(/Let me analyze.*?:/i)

      // The content should have meaningful section headers
      expect(content).toMatch(/## Project Overview/)
      expect(content).toMatch(/## Build System/)
    }
  })

  test('collectConfigMetadataSignals detects metadata from config files', async () => {
    await fs.mkdir('src', { recursive: true })
    await fs.writeFile('src/index.ts', 'export const value = 1', 'utf-8')
    await fs.writeFile('tsconfig.json', '{}', 'utf-8')
    await fs.writeFile('Dockerfile', 'FROM node:18', 'utf-8')
    await fs.writeFile('docker-compose.yml', 'version: "3"', 'utf-8')
    await fs.writeFile('jest.config.js', 'module.exports = {}', 'utf-8')
    await fs.writeFile('vite.config.ts', 'export default {}', 'utf-8')

    const signals: MetadataSignal[] = []
    collectConfigMetadataSignals(process.cwd(), signals)

    const signalKeys = new Set(
      signals.map(
        signal => `${signal.section}|${signal.value}|${signal.sourceType}|${signal.sourceTag}`
      )
    )

    expect(signalKeys).toContain('languages|TypeScript|config|config:ext:ts')
    expect(signalKeys).toContain('languages|TypeScript|config|config:tsconfig')
    expect(signalKeys).toContain('buildSystems|Vite|config|config:vite')
    expect(signalKeys).toContain('testingFrameworks|Jest|config|config:jest')
    expect(signalKeys).toContain('architecture|src/ directory structure|config|config:src')
    expect(signalKeys).toContain('deployment|Docker containerization|config|config:dockerfile')
    expect(signalKeys).toContain('deployment|Docker Compose|config|config:docker-compose')
  })

  test('collectWorkflowMetadataSignals detects workflow metadata', async () => {
    const workflowsPath = join('.github', 'workflows')
    await fs.mkdir(workflowsPath, { recursive: true })
    await fs.writeFile(join(workflowsPath, 'ci.yml'), 'name: ci', 'utf-8')

    const signals: MetadataSignal[] = []
    collectWorkflowMetadataSignals(process.cwd(), signals)

    const signalKeys = new Set(
      signals.map(
        signal => `${signal.section}|${signal.value}|${signal.sourceType}|${signal.sourceTag}`
      )
    )

    expect(signalKeys).toContain('architecture|GitHub Actions CI/CD|workflow|workflow:ci.yml')
    expect(signalKeys).toContain('deployment|GitHub Actions CI/CD|workflow|workflow:ci.yml')
  })

  test('collectDocsMetadataSignals reads metadata from docs', async () => {
    await fs.writeFile(
      'README.md',
      [
        'PRIMARY LANGUAGES: [TypeScript, Go]',
        'BUILD SYSTEMS: [Bun]',
        'TESTING FRAMEWORKS: [Vitest]',
        'ARCHITECTURE PATTERN: CLI orchestration',
        'DEPLOYMENT STRATEGY: Vercel',
      ].join('\n'),
      'utf-8'
    )

    const signals: MetadataSignal[] = []
    collectDocsMetadataSignals(process.cwd(), signals)

    const signalKeys = new Set(
      signals.map(
        signal => `${signal.section}|${signal.value}|${signal.sourceType}|${signal.sourceTag}`
      )
    )

    expect(signalKeys).toContain('languages|TypeScript|doc|doc:README.md')
    expect(signalKeys).toContain('languages|Go|doc|doc:README.md')
    expect(signalKeys).toContain('buildSystems|Bun|doc|doc:README.md')
    expect(signalKeys).toContain('testingFrameworks|Vitest|doc|doc:README.md')
    expect(signalKeys).toContain('architecture|CLI orchestration|doc|doc:README.md')
    expect(signalKeys).toContain('deployment|Vercel|doc|doc:README.md')
  })

  test('collectAgentsDocsMetadataSignals reads metadata from agents-docs', async () => {
    const agentsDocsPath = join(process.cwd(), AGENTS_DOCS_DIR)
    await fs.mkdir(agentsDocsPath, { recursive: true })
    await fs.writeFile(
      join(agentsDocsPath, 'metadata.md'),
      [
        'PRIMARY LANGUAGES: [Rust]',
        'BUILD SYSTEMS: [Cargo]',
        'TESTING FRAMEWORKS: [pytest]',
        'ARCHITECTURE PATTERN: event-driven',
        'DEPLOYMENT STRATEGY: Fly.io',
      ].join('\n'),
      'utf-8'
    )

    const signals: MetadataSignal[] = []
    collectAgentsDocsMetadataSignals(process.cwd(), signals)

    const signalKeys = new Set(
      signals.map(
        signal => `${signal.section}|${signal.value}|${signal.sourceType}|${signal.sourceTag}`
      )
    )

    expect(signalKeys).toContain('languages|Rust|agents-docs|agents-docs:metadata.md')
    expect(signalKeys).toContain('buildSystems|Cargo|agents-docs|agents-docs:metadata.md')
    expect(signalKeys).toContain('testingFrameworks|pytest|agents-docs|agents-docs:metadata.md')
    expect(signalKeys).toContain('architecture|event-driven|agents-docs|agents-docs:metadata.md')
    expect(signalKeys).toContain('deployment|Fly.io|agents-docs|agents-docs:metadata.md')
  })

  test('dedupeMetadataSignals removes duplicates deterministically', () => {
    const signals: MetadataSignal[] = [
      {
        section: 'languages',
        value: 'TypeScript',
        sourceType: 'doc',
        sourceTag: 'doc:README.md',
      },
      {
        section: 'languages',
        value: 'typescript',
        sourceType: 'config',
        sourceTag: 'config:tsconfig',
      },
      {
        section: 'buildSystems',
        value: 'Bun',
        sourceType: 'config',
        sourceTag: 'config:bun.lock',
      },
    ]

    const deduped = dedupeMetadataSignals(signals)

    expect(deduped).toHaveLength(2)
    expect(deduped[0]).toMatchObject({
      section: 'languages',
      value: 'TypeScript',
      sourceType: 'doc',
    })
    expect(deduped[1]).toMatchObject({
      section: 'buildSystems',
      value: 'Bun',
    })
  })

  test('isUnavailableAgentResult detects placeholder responses', () => {
    expect(isUnavailableAgentResult('')).toBe(true)
    expect(isUnavailableAgentResult('Unknown')).toBe(true)
    expect(isUnavailableAgentResult('not available')).toBe(true)
    expect(isUnavailableAgentResult('Information not available.')).toBe(true)
    expect(isUnavailableAgentResult('Static analysis detected: TypeScript')).toBe(false)
  })

  test('mergeGeneratedContent replaces generated block when markers exist', () => {
    const existingContent = [
      '# AGENTS.md',
      '',
      'Intro text',
      '<!-- BEGIN GENERATED: AGENTS-MD -->',
      'Old generated',
      '<!-- END GENERATED: AGENTS-MD -->',
      '',
      'Custom notes',
    ].join('\n')

    const generatedContent = [
      '<!-- BEGIN GENERATED: AGENTS-MD -->',
      'New generated',
      '<!-- END GENERATED: AGENTS-MD -->',
      '',
    ].join('\n')

    const merged = mergeGeneratedContent(existingContent, generatedContent)
    expect(merged).not.toBeNull()
    expect(merged).toContain('New generated')
    expect(merged).toContain('Intro text')
    expect(merged).toContain('Custom notes')
    expect(merged).not.toContain('Old generated')
  })

  test('mergeGeneratedContent returns null when markers are missing', () => {
    const existingContent = ['# AGENTS.md', '', 'No markers'].join('\n')
    const generatedContent = [
      '<!-- BEGIN GENERATED: AGENTS-MD -->',
      'New generated',
      '<!-- END GENERATED: AGENTS-MD -->',
    ].join('\n')

    const merged = mergeGeneratedContent(existingContent, generatedContent)
    expect(merged).toBeNull()
  })

  test('extractPreservableContent skips generated sections and nested headers', () => {
    const existingContent = [
      '# AGENTS.md',
      '',
      '## Project Overview',
      'Generated overview',
      '### Generated Subsection',
      'More generated content',
      '',
      '## Custom Notes',
      'Keep this section',
      '### Detail',
      'Keep detail too',
      '',
      '## Testing Framework',
      'Generated testing',
      '### Nested Generated',
      'Ignore nested content',
      '',
      '## Additional Tips',
      'Keep tips',
    ].join('\n')

    const preserved = extractPreservableContent(existingContent, [
      'Project Overview',
      'Testing Framework',
    ])

    expect(preserved).not.toBeNull()
    expect(preserved).toContain('## Custom Notes')
    expect(preserved).toContain('### Detail')
    expect(preserved).toContain('Keep detail too')
    expect(preserved).toContain('## Additional Tips')
    expect(preserved).toContain('Keep tips')
    expect(preserved).not.toContain('## Project Overview')
    expect(preserved).not.toContain('Generated Subsection')
    expect(preserved).not.toContain('## Testing Framework')
    expect(preserved).not.toContain('Nested Generated')
  })
})
