import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  parsePrdContent,
  extractRequirementIds,
  getNextRequirementId,
  runRequirementRefinementQA,
  detectContentReferences,
  fetchContentReferences,
  formatRequirement,
  insertRequirementsIntoSection,
  parseTaskFileContent,
  getNextTaskId,
  updateTaskFileMetadata,
  prepareAtomicWrite,
  commitAtomicWrite,
  rollbackAtomicWrite,
  atomicWriteFile,
  AtomicTransaction,
} from './extend-prd.js'

describe('PRD Parser', () => {
  describe('parsePrdContent', () => {
    it('should parse basic PRD structure', () => {
      const content = `# PRD: Test Feature

## Overview
This is a test PRD.

## Requirements

### Functional Requirements
- REQ-F-001: Basic functionality test
- REQ-F-002: Another test function

### Non-Functional Requirements
- REQ-NF-001: Performance requirement
`

      const result = parsePrdContent(content)

      expect(result.title).toBe('Test Feature')
      expect(result.sections.size).toBe(2)
      expect(result.sections.has('Overview')).toBe(true)
      expect(result.sections.has('Requirements')).toBe(true)
      expect(result.requirements).toHaveLength(3)
      expect(result.isValid).toBe(true)
    })

    it('should detect missing required sections', () => {
      const content = `# PRD: Incomplete Feature

## Goals
Some goals here.
`

      const result = parsePrdContent(content)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing required section: Overview')
      expect(result.errors).toContain('Missing required section: Requirements')
    })

    it('should parse requirement IDs correctly', () => {
      const content = `# PRD: Requirements Test

## Overview
Test overview.

## Requirements

### Functional Requirements
- REQ-F-001: First functional requirement
- REQ-F-002: Second functional requirement

### Non-Functional Requirements
- REQ-NF-001: First non-functional requirement
`

      const result = parsePrdContent(content)

      expect(result.requirements).toHaveLength(3)
      expect(result.requirements[0]).toEqual({
        id: 'REQ-F-001',
        description: 'First functional requirement',
        type: 'functional',
        lineNumber: 9,
      })
      expect(result.requirements[2]).toEqual({
        id: 'REQ-NF-001',
        description: 'First non-functional requirement',
        type: 'non-functional',
        lineNumber: 13,
      })
    })
  })

  describe('Task File Operations', () => {
    describe('parseTaskFileContent', () => {
      it('should parse valid task file content', () => {
        const content = `feature: test-feature
prd: ./prd-test-feature.md
created_at: 2026-02-05T10:00:00.000Z
updated_at: 2026-02-05T12:00:00.000Z

tasks:
  - id: task-001
    title: "First task"
    description: |
      This is the first task description.
      It has multiple lines.
    status: completed
    dependencies: []
    acceptance_criteria:
      - "Criterion 1"
      - "Criterion 2"
    completed_at: 2026-02-05T11:00:00.000Z

  - id: task-002
    title: "Second task"
    description: |
      This is the second task.
    status: pending
    dependencies:
      - task-001
    acceptance_criteria:
      - "Criterion A"
      - "Criterion B"
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(true)
        expect(result.errors).toHaveLength(0)
        expect(result.taskFile.feature).toBe('test-feature')
        expect(result.taskFile.tasks).toHaveLength(2)
        expect(result.taskIds).toEqual(['task-001', 'task-002'])
        expect(result.highestTaskId).toBe(2)
      })

      it('should extract highest task ID correctly', () => {
        const content = `feature: test-feature
created_at: 2026-02-05T10:00:00.000Z
updated_at: 2026-02-05T12:00:00.000Z

tasks:
  - id: task-003
    title: "Third task"
    description: "Task three"
    status: pending
    dependencies: []
    acceptance_criteria: ["Test"]
    completed_at: null
  - id: task-001
    title: "First task"  
    description: "Task one"
    status: completed
    dependencies: []
    acceptance_criteria: ["Test"]
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.highestTaskId).toBe(3)
        expect(result.taskIds).toEqual(['task-003', 'task-001'])
      })

      it('should detect missing required fields', () => {
        const content = `feature: test-feature
tasks:
  - id: task-001
    title: "Missing description"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Task "task-001" missing required "description" field')
      })
    })

    describe('getNextTaskId', () => {
      it('should generate next available task ID', () => {
        const parsedTaskFile = {
          taskFile: { feature: 'test', created_at: '', updated_at: '', tasks: [] },
          taskIds: ['task-001', 'task-003'],
          highestTaskId: 3,
          isValid: true,
          errors: [],
        }

        const nextId = getNextTaskId(parsedTaskFile)

        expect(nextId).toBe('task-004')
      })

      it('should handle empty task file', () => {
        const parsedTaskFile = {
          taskFile: { feature: 'test', created_at: '', updated_at: '', tasks: [] },
          taskIds: [],
          highestTaskId: 0,
          isValid: true,
          errors: [],
        }

        const nextId = getNextTaskId(parsedTaskFile)

        expect(nextId).toBe('task-001')
      })
    })

    describe('updateTaskFileMetadata', () => {
      it('should update metadata when adding new tasks', () => {
        const originalTaskFile = {
          feature: 'test-feature',
          prd: './prd-test.md',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          tasks: [
            {
              id: 'task-001',
              title: 'Existing task',
              description: 'An existing task',
              status: 'completed' as const,
              dependencies: [],
              acceptance_criteria: ['Test passes'],
              completed_at: '2026-01-01T01:00:00.000Z',
            },
          ],
        }

        const newTasks = [
          {
            id: 'task-002',
            title: 'New task',
            description: 'A new task',
            status: 'pending' as const,
            dependencies: ['task-001'],
            acceptance_criteria: ['New test passes'],
            completed_at: null,
          },
        ]

        const result = updateTaskFileMetadata(originalTaskFile, newTasks)

        expect(result.feature).toBe('test-feature')
        expect(result.prd).toBe('./prd-test.md')
        expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
        expect(result.updated_at).not.toBe('2026-01-01T00:00:00.000Z') // Should be updated to current time
        expect(result.tasks).toHaveLength(2)
        expect(result.tasks[0]).toEqual(originalTaskFile.tasks[0])
        expect(result.tasks[1]).toEqual(newTasks[0])
      })

      it('should preserve all metadata fields when no prd field exists', () => {
        const originalTaskFile = {
          feature: 'test-feature',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          tasks: [],
        }

        const newTasks = [
          {
            id: 'task-001',
            title: 'First task',
            description: 'The first task',
            status: 'pending' as const,
            dependencies: [],
            acceptance_criteria: ['Test passes'],
            completed_at: null,
          },
        ]

        const result = updateTaskFileMetadata(originalTaskFile, newTasks)

        expect(result.feature).toBe('test-feature')
        expect(result.prd).toBeUndefined()
        expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
        expect(result.updated_at).not.toBe('2026-01-01T00:00:00.000Z')
        expect(result.tasks).toHaveLength(1)
        expect(result.tasks[0]).toEqual(newTasks[0])
      })

      it('should handle empty new tasks array', () => {
        const originalTaskFile = {
          feature: 'test-feature',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          tasks: [
            {
              id: 'task-001',
              title: 'Existing task',
              description: 'An existing task',
              status: 'completed' as const,
              dependencies: [],
              acceptance_criteria: ['Test passes'],
              completed_at: '2026-01-01T01:00:00.000Z',
            },
          ],
        }

        const newTasks: any[] = []

        const result = updateTaskFileMetadata(originalTaskFile, newTasks)

        expect(result.feature).toBe('test-feature')
        expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
        expect(result.updated_at).not.toBe('2026-01-01T00:00:00.000Z')
        expect(result.tasks).toHaveLength(1)
        expect(result.tasks[0]).toEqual(originalTaskFile.tasks[0])
      })
    })
  })

  describe('extractRequirementIds', () => {
    it('should extract and categorize requirement IDs', () => {
      const prd = parsePrdContent(`# PRD: Test

## Overview
Test

## Requirements

### Functional Requirements
- REQ-F-001: Func 1
- REQ-F-003: Func 3

### Non-Functional Requirements
- REQ-NF-001: Non-func 1
- REQ-NF-002: Non-func 2
`)

      const ids = extractRequirementIds(prd)

      expect(ids.functional).toEqual(['REQ-F-001', 'REQ-F-003'])
      expect(ids.nonFunctional).toEqual(['REQ-NF-001', 'REQ-NF-002'])
      expect(ids.allIds).toEqual(['REQ-F-001', 'REQ-F-003', 'REQ-NF-001', 'REQ-NF-002'])
    })
  })

  describe('getNextRequirementId', () => {
    it('should generate next functional requirement ID', () => {
      const prd = parsePrdContent(`# PRD: Test

## Overview
Test

## Requirements

### Functional Requirements
- REQ-F-001: Func 1
- REQ-F-002: Func 2

### Non-Functional Requirements
- REQ-NF-001: Non-func 1
`)

      const nextId = getNextRequirementId(prd, 'functional')
      expect(nextId).toBe('REQ-F-003')
    })

    it('should generate next non-functional requirement ID', () => {
      const prd = parsePrdContent(`# PRD: Test

## Overview
Test

## Requirements

### Functional Requirements
- REQ-F-001: Func 1

### Non-Functional Requirements
- REQ-NF-001: Non-func 1
- REQ-NF-005: Non-func 5
`)

      const nextId = getNextRequirementId(prd, 'non-functional')
      expect(nextId).toBe('REQ-NF-006')
    })

    it('should handle empty requirements', () => {
      const prd = parsePrdContent(`# PRD: Test

## Overview
Test

## Requirements

### Functional Requirements

### Non-Functional Requirements
`)

      const nextFuncId = getNextRequirementId(prd, 'functional')
      const nextNonFuncId = getNextRequirementId(prd, 'non-functional')

      expect(nextFuncId).toBe('REQ-F-001')
      expect(nextNonFuncId).toBe('REQ-NF-001')
    })
  })
})

describe('Content Reference Detection', () => {
  describe('detectContentReferences', () => {
    it('should detect HTTP URLs', () => {
      const text = 'See https://example.com/api and http://test.com/docs for reference'
      const refs = detectContentReferences(text)

      expect(refs).toEqual([
        { type: 'url', reference: 'https://example.com/api' },
        { type: 'url', reference: 'http://test.com/docs' },
      ])
    })

    it('should detect relative file paths', () => {
      const text = 'Check ./src/config.ts and ../docs/readme.md for details'
      const refs = detectContentReferences(text)

      expect(refs).toEqual([
        { type: 'file', reference: './src/config.ts' },
        { type: 'file', reference: '../docs/readme.md' },
      ])
    })

    it('should detect absolute file paths', () => {
      const text = 'Look at /etc/config.json and ~/Documents/spec.txt'
      const refs = detectContentReferences(text)

      expect(refs).toEqual([
        { type: 'file', reference: '/etc/config.json' },
        { type: 'file', reference: '~/Documents/spec.txt' },
      ])
    })

    it('should detect file extensions', () => {
      const text = 'Based on src/index.ts, config/settings.json, and docs/api.md requirements'
      const refs = detectContentReferences(text)

      expect(refs).toEqual([
        { type: 'file', reference: 'src/index.ts' },
        { type: 'file', reference: 'config/settings.json' },
        { type: 'file', reference: 'docs/api.md' },
      ])
    })

    it('should remove duplicate references', () => {
      const text = 'Check src/file.ts and also look at src/file.ts again'
      const refs = detectContentReferences(text)

      expect(refs).toHaveLength(1)
      expect(refs[0]).toEqual({ type: 'file', reference: 'src/file.ts' })
    })

    it('should clean trailing punctuation', () => {
      const text = 'Visit https://example.com/api. Also check src/file.ts!'
      const refs = detectContentReferences(text)

      expect(refs).toEqual([
        { type: 'url', reference: 'https://example.com/api' },
        { type: 'file', reference: 'src/file.ts' },
      ])
    })

    it('should handle mixed content types', () => {
      const text = `
        Based on the specification at https://api.example.com/docs,
        implement features described in ./specs/feature.md and
        follow patterns from src/utils/helper.ts.
      `
      const refs = detectContentReferences(text)

      expect(refs).toEqual([
        { type: 'url', reference: 'https://api.example.com/docs' },
        { type: 'file', reference: './specs/feature.md' },
        { type: 'file', reference: 'src/utils/helper.ts' },
      ])
    })

    it('should handle empty text', () => {
      const refs = detectContentReferences('')
      expect(refs).toEqual([])
    })

    it('should ignore very short matches', () => {
      const text = 'Use x.y but not this short match'
      const refs = detectContentReferences(text)
      expect(refs).toEqual([])
    })
  })

  describe('fetchContentReferences', () => {
    it('should return content context structure', async () => {
      const text = 'No references here'
      const context = await fetchContentReferences(text)

      expect(context).toHaveProperty('references')
      expect(context).toHaveProperty('successful')
      expect(context).toHaveProperty('failed')
      expect(Array.isArray(context.references)).toBe(true)
      expect(Array.isArray(context.successful)).toBe(true)
      expect(Array.isArray(context.failed)).toBe(true)
    })

    it('should handle empty input', async () => {
      const context = await fetchContentReferences('')

      expect(context.references).toHaveLength(0)
      expect(context.successful).toHaveLength(0)
      expect(context.failed).toHaveLength(0)
    })
  })
})

describe('Interactive Q&A System', () => {
  describe('runRequirementRefinementQA', () => {
    it('should be exportable function', () => {
      expect(typeof runRequirementRefinementQA).toBe('function')
    })
  })
})

describe('PRD Content Appending', () => {
  describe('formatRequirement', () => {
    it('should format requirement with ID prefix', () => {
      const requirement = 'System should validate user input'
      const id = 'REQ-F-001'
      const result = formatRequirement(requirement, id)

      expect(result).toBe('- REQ-F-001: System should validate user input')
    })

    it('should handle non-functional requirements', () => {
      const requirement = 'System response time should be under 200ms'
      const id = 'REQ-NF-001'
      const result = formatRequirement(requirement, id)

      expect(result).toBe('- REQ-NF-001: System response time should be under 200ms')
    })
  })

  describe('insertRequirementsIntoSection', () => {
    it('should insert requirements into functional requirements section', () => {
      const sectionContent = `## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement

### Non-Functional Requirements
- REQ-NF-001: Existing non-functional requirement`

      const newRequirements = [
        '- REQ-F-002: New functional requirement',
        '- REQ-F-003: Another new requirement',
      ]

      const result = insertRequirementsIntoSection(
        sectionContent,
        newRequirements,
        'Functional Requirements'
      )

      expect(result).toContain('- REQ-F-001: Existing requirement')
      expect(result).toContain('- REQ-F-002: New functional requirement')
      expect(result).toContain('- REQ-F-003: Another new requirement')
      expect(result).toContain('### Non-Functional Requirements')
    })

    it('should insert requirements into non-functional requirements section', () => {
      const sectionContent = `## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement

### Non-Functional Requirements
- REQ-NF-001: Existing non-functional requirement`

      const newRequirements = ['- REQ-NF-002: New non-functional requirement']

      const result = insertRequirementsIntoSection(
        sectionContent,
        newRequirements,
        'Non-Functional Requirements'
      )

      expect(result).toContain('- REQ-NF-001: Existing non-functional requirement')
      expect(result).toContain('- REQ-NF-002: New non-functional requirement')
    })

    it('should handle empty new requirements array', () => {
      const sectionContent = `## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement`

      const result = insertRequirementsIntoSection(sectionContent, [], 'Functional Requirements')

      expect(result).toBe(sectionContent)
    })

    it('should throw error if subsection not found', () => {
      const sectionContent = `## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement`

      const newRequirements = ['- REQ-NF-001: New requirement']

      expect(() => {
        insertRequirementsIntoSection(
          sectionContent,
          newRequirements,
          'Non-Functional Requirements'
        )
      }).toThrow('Subsection "Non-Functional Requirements" not found in Requirements section')
    })

    it('should handle section at end of content', () => {
      const sectionContent = `## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement

### Non-Functional Requirements
- REQ-NF-001: Existing non-functional requirement`

      const newRequirements = ['- REQ-NF-002: New non-functional requirement']

      const result = insertRequirementsIntoSection(
        sectionContent,
        newRequirements,
        'Non-Functional Requirements'
      )

      expect(result).toContain('- REQ-NF-001: Existing non-functional requirement')
      expect(result).toContain('- REQ-NF-002: New non-functional requirement')
    })
  })
})

describe('Atomic File Operations', () => {
  const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs')
  const { join } = require('path')

  const testDir = join(__dirname, 'test-atomic-operations')
  const testFile = join(testDir, 'test.txt')

  beforeAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe('prepareAtomicWrite', () => {
    it('should create temporary file with content', async () => {
      const content = 'test content'
      const operation = await prepareAtomicWrite(testFile, content)

      expect(operation.targetPath).toBe(testFile)
      expect(operation.content).toBe(content)
      expect(operation.originalExists).toBe(false)
      expect(operation.tempPath).toContain('.tmp.')
      expect(existsSync(operation.tempPath)).toBe(true)
      expect(readFileSync(operation.tempPath, 'utf-8')).toBe(content)

      // Cleanup
      await rollbackAtomicWrite(operation)
    })

    it('should detect existing file correctly', async () => {
      writeFileSync(testFile, 'existing content')

      const content = 'new content'
      const operation = await prepareAtomicWrite(testFile, content)

      expect(operation.originalExists).toBe(true)
      expect(readFileSync(operation.tempPath, 'utf-8')).toBe(content)

      // Cleanup
      await rollbackAtomicWrite(operation)
      rmSync(testFile)
    })
  })

  describe('commitAtomicWrite', () => {
    it('should move temp file to target location', async () => {
      const content = 'test content for commit'
      const operation = await prepareAtomicWrite(testFile, content)

      expect(existsSync(operation.tempPath)).toBe(true)
      expect(existsSync(testFile)).toBe(false)

      await commitAtomicWrite(operation)

      expect(existsSync(operation.tempPath)).toBe(false)
      expect(existsSync(testFile)).toBe(true)
      expect(readFileSync(testFile, 'utf-8')).toBe(content)

      // Cleanup
      rmSync(testFile)
    })

    it('should handle commit failure and clean up temp file', async () => {
      const content = 'test content'
      const operation = await prepareAtomicWrite(testFile, content)

      // Modify operation to point to invalid target path (to cause rename to fail)
      operation.targetPath = '/nonexistent/directory/cannot/write'

      await expect(commitAtomicWrite(operation)).rejects.toThrow()

      // Verify temp file is cleaned up after failure
      expect(existsSync(operation.tempPath)).toBe(false)
    })
  })

  describe('rollbackAtomicWrite', () => {
    it('should remove temporary file', async () => {
      const content = 'test content for rollback'
      const operation = await prepareAtomicWrite(testFile, content)

      expect(existsSync(operation.tempPath)).toBe(true)

      await rollbackAtomicWrite(operation)

      expect(existsSync(operation.tempPath)).toBe(false)
      expect(existsSync(testFile)).toBe(false)
    })

    it('should handle missing temp file gracefully', async () => {
      const operation = {
        targetPath: testFile,
        tempPath: join(testDir, 'nonexistent.tmp'),
        content: 'test',
        originalExists: false,
      }

      // Should not throw error
      await expect(rollbackAtomicWrite(operation)).resolves.toBeUndefined()
    })
  })

  describe('atomicWriteFile', () => {
    it('should write file atomically', async () => {
      const content = 'atomic write test content'

      await atomicWriteFile(testFile, content)

      expect(existsSync(testFile)).toBe(true)
      expect(readFileSync(testFile, 'utf-8')).toBe(content)

      // Cleanup
      rmSync(testFile)
    })
  })

  describe('AtomicTransaction', () => {
    it('should handle multiple file operations atomically', async () => {
      const file1 = join(testDir, 'file1.txt')
      const file2 = join(testDir, 'file2.txt')
      const content1 = 'content for file 1'
      const content2 = 'content for file 2'

      const transaction = new AtomicTransaction()

      await transaction.prepareWrite(file1, content1)
      await transaction.prepareWrite(file2, content2)

      expect(transaction.pendingCount).toBe(2)
      expect(existsSync(file1)).toBe(false)
      expect(existsSync(file2)).toBe(false)

      await transaction.commit()

      expect(transaction.pendingCount).toBe(0)
      expect(existsSync(file1)).toBe(true)
      expect(existsSync(file2)).toBe(true)
      expect(readFileSync(file1, 'utf-8')).toBe(content1)
      expect(readFileSync(file2, 'utf-8')).toBe(content2)

      // Cleanup
      rmSync(file1)
      rmSync(file2)
    })

    it('should rollback all operations on failure', async () => {
      const file1 = join(testDir, 'file1.txt')
      const file2 = join(testDir, 'file2.txt')
      const content1 = 'content for file 1'
      const content2 = 'content for file 2'

      const transaction = new AtomicTransaction()

      await transaction.prepareWrite(file1, content1)
      await transaction.prepareWrite(file2, content2)

      expect(transaction.pendingCount).toBe(2)

      await transaction.rollback()

      expect(transaction.pendingCount).toBe(0)
      expect(existsSync(file1)).toBe(false)
      expect(existsSync(file2)).toBe(false)
    })

    it('should handle empty transaction', async () => {
      const transaction = new AtomicTransaction()

      expect(transaction.pendingCount).toBe(0)

      await expect(transaction.commit()).resolves.toBeUndefined()
      await expect(transaction.rollback()).resolves.toBeUndefined()
    })
  })
})
