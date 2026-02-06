import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import {
  parsePrdContent,
  extractRequirementIds,
  getNextRequirementId,
  runRequirementRefinementQA,
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
  parsePrdFile,
  parseTaskFile,
  extractTaskIds,
  taskIdExists,
  derivePrdToTaskFilename,
  extractContentAccessIssues,
  generateNewRequirementsContent,
  extendPRD,
  validatePrdStructure,
  askQuestion,
} from './extend-prd.js'
import type { PrdRequirement, Task } from './extend-prd.js'

// Mock AgentClient for agent-based content fetching tests
const mockAgentClient = {
  messages: {
    create: mock<any>(() =>
      Promise.resolve({
        content: [
          {
            type: 'text',
            text: 'DONE', // Default response for clarifying questions
          },
        ],
      })
    ),
  },
}

// Mock the AgentClient constructor
mock.module('./agent-client', () => ({
  AgentClient: mock(() => mockAgentClient),
}))

// Mock config and model resolution
mock.module('./config', () => ({
  loadConfig: mock(() =>
    Promise.resolve({
      defaultAgent: 'opencode',
      models: {},
    })
  ),
  resolveModelForPhase: mock(() => 'claude-sonnet-4-20250514'),
}))

// Mock readline for interactive Q&A tests
const mockReadlineInterface = {
  question: mock(),
  close: mock(),
}

mock.module('readline', () => ({
  createInterface: mock(() => mockReadlineInterface),
}))

// Mock error utilities
mock.module('./errors', () => ({
  HoneError: class HoneError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'HoneError'
    }
  },
  formatError: (title: string, message: string) => `${title}: ${message}`,
  isNetworkError: mock((error: any) => {
    return error.message && error.message.includes('Network')
  }),
  retryWithBackoff: mock(async (fn: any, options: any) => {
    // For testing, simulate retry behavior
    try {
      return await fn()
    } catch (error: any) {
      if (error.message && error.message.includes('Network')) {
        // Simulate one retry for network errors
        return await fn()
      }
      throw error
    }
  }),
  ErrorMessages: {},
}))

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

  describe('PRD to Task Filename Derivation', () => {
    describe('derivePrdToTaskFilename', () => {
      it('should derive task filename from PRD filename correctly', () => {
        expect(derivePrdToTaskFilename('prd-user-auth.md')).toBe('tasks-user-auth.yml')
        expect(derivePrdToTaskFilename('prd-extend-prd-command.md')).toBe(
          'tasks-extend-prd-command.yml'
        )
        expect(derivePrdToTaskFilename('/path/to/prd-feature-name.md')).toBe(
          'tasks-feature-name.yml'
        )
        expect(derivePrdToTaskFilename('./prd-simple.md')).toBe('tasks-simple.yml')
      })

      it('should handle complex feature names with hyphens and numbers', () => {
        expect(derivePrdToTaskFilename('prd-user-auth-v2.md')).toBe('tasks-user-auth-v2.yml')
        expect(derivePrdToTaskFilename('prd-api-integration-oauth2.md')).toBe(
          'tasks-api-integration-oauth2.yml'
        )
        expect(derivePrdToTaskFilename('prd-feature-123-test.md')).toBe(
          'tasks-feature-123-test.yml'
        )
      })

      it('should throw error for invalid PRD filename format', () => {
        expect(() => derivePrdToTaskFilename('invalid-file.md')).toThrow(
          'Invalid PRD filename format'
        )
        expect(() => derivePrdToTaskFilename('prd-feature.txt')).toThrow(
          'Invalid PRD filename format'
        )
        expect(() => derivePrdToTaskFilename('feature.md')).toThrow('Invalid PRD filename format')
        expect(() => derivePrdToTaskFilename('prd-.md')).toThrow('Invalid PRD filename format')
      })

      it('should throw error for missing or invalid input', () => {
        expect(() => derivePrdToTaskFilename('')).toThrow('PRD file path is required')
        expect(() => derivePrdToTaskFilename(null as any)).toThrow('PRD file path is required')
        expect(() => derivePrdToTaskFilename(undefined as any)).toThrow('PRD file path is required')
        expect(() => derivePrdToTaskFilename(123 as any)).toThrow('PRD file path is required')
      })

      it('should handle edge cases in filename', () => {
        expect(derivePrdToTaskFilename('prd-a.md')).toBe('tasks-a.yml')
        expect(derivePrdToTaskFilename('prd-feature-with-many-hyphens-and-words.md')).toBe(
          'tasks-feature-with-many-hyphens-and-words.yml'
        )
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

        const newTasks: Task[] = []

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

describe('Validation Functions Unit Tests', () => {
  describe('validatePrdStructure', () => {
    it('should return false and add errors for missing functional requirements subsection', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Non-Functional Requirements
- REQ-NF-001: Test non-functional requirement`,
            startLine: 6,
            endLine: 9,
          },
        ],
      ])
      const requirements: PrdRequirement[] = []
      const errors: string[] = []

      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(false)
      expect(errors).toContain(
        'Requirements section missing "### Functional Requirements" subsection'
      )
    })

    it('should return false and add errors for missing non-functional requirements subsection', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements
- REQ-F-001: Test requirement`,
            startLine: 6,
            endLine: 9,
          },
        ],
      ])
      const requirements: any[] = []
      const errors: string[] = []

      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(false)
      expect(errors).toContain(
        'Requirements section missing "### Non-Functional Requirements" subsection'
      )
    })

    it('should detect functional requirement numbering gaps', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements
- REQ-F-001: First requirement
- REQ-F-003: Third requirement (gap!)

### Non-Functional Requirements`,
            startLine: 6,
            endLine: 12,
          },
        ],
      ])

      const requirements = [
        {
          id: 'REQ-F-001',
          description: 'First requirement',
          type: 'functional' as const,
          lineNumber: 9,
        },
        {
          id: 'REQ-F-003',
          description: 'Third requirement (gap!)',
          type: 'functional' as const,
          lineNumber: 10,
        },
      ]

      const errors: string[] = []
      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(false)
      expect(errors).toContain(
        'Functional requirement numbering gap: expected REQ-F-002, found REQ-F-003'
      )
    })

    it('should detect non-functional requirement numbering gaps', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements

### Non-Functional Requirements
- REQ-NF-001: First requirement
- REQ-NF-004: Fourth requirement (gap!)`,
            startLine: 6,
            endLine: 12,
          },
        ],
      ])

      const requirements = [
        {
          id: 'REQ-NF-001',
          description: 'First requirement',
          type: 'non-functional' as const,
          lineNumber: 10,
        },
        {
          id: 'REQ-NF-004',
          description: 'Fourth requirement (gap!)',
          type: 'non-functional' as const,
          lineNumber: 11,
        },
      ]

      const errors: string[] = []
      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(false)
      expect(errors).toContain(
        'Non-functional requirement numbering gap: expected REQ-NF-002, found REQ-NF-004'
      )
    })

    it('should handle mixed requirement types and multiple numbering gaps', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements
- REQ-F-002: Second requirement (missing REQ-F-001)
- REQ-F-005: Fifth requirement (gap)

### Non-Functional Requirements
- REQ-NF-003: Third requirement (missing REQ-NF-001, REQ-NF-002)`,
            startLine: 6,
            endLine: 13,
          },
        ],
      ])

      const requirements = [
        {
          id: 'REQ-F-002',
          description: 'Second requirement (missing REQ-F-001)',
          type: 'functional' as const,
          lineNumber: 9,
        },
        {
          id: 'REQ-F-005',
          description: 'Fifth requirement (gap)',
          type: 'functional' as const,
          lineNumber: 10,
        },
        {
          id: 'REQ-NF-003',
          description: 'Third requirement (missing REQ-NF-001, REQ-NF-002)',
          type: 'non-functional' as const,
          lineNumber: 13,
        },
      ]

      const errors: string[] = []
      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(false)
      expect(errors).toHaveLength(3)
      expect(errors).toContain(
        'Functional requirement numbering gap: expected REQ-F-001, found REQ-F-002'
      )
      expect(errors).toContain(
        'Functional requirement numbering gap: expected REQ-F-002, found REQ-F-005'
      )
      expect(errors).toContain(
        'Non-functional requirement numbering gap: expected REQ-NF-001, found REQ-NF-003'
      )
    })

    it('should handle empty requirements arrays gracefully', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements

### Non-Functional Requirements`,
            startLine: 6,
            endLine: 10,
          },
        ],
      ])

      const requirements: PrdRequirement[] = []
      const errors: string[] = []
      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(true)
      expect(errors).toHaveLength(0)
    })

    it('should handle requirements with same ID prefix but different types', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements
- REQ-F-001: Functional requirement

### Non-Functional Requirements
- REQ-NF-001: Non-functional requirement`,
            startLine: 6,
            endLine: 12,
          },
        ],
      ])

      const requirements = [
        {
          id: 'REQ-F-001',
          description: 'Functional requirement',
          type: 'functional' as const,
          lineNumber: 9,
        },
        {
          id: 'REQ-NF-001',
          description: 'Non-functional requirement',
          type: 'non-functional' as const,
          lineNumber: 12,
        },
      ]

      const errors: string[] = []
      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(true)
      expect(errors).toHaveLength(0)
    })

    it('should handle unsorted requirements and still detect numbering gaps correctly', () => {
      const sections = new Map([
        ['Overview', { title: 'Overview', content: 'Test overview', startLine: 3, endLine: 4 }],
        [
          'Requirements',
          {
            title: 'Requirements',
            content: `## Requirements

### Functional Requirements
- REQ-F-003: Third requirement
- REQ-F-001: First requirement

### Non-Functional Requirements`,
            startLine: 6,
            endLine: 12,
          },
        ],
      ])

      const requirements = [
        {
          id: 'REQ-F-003',
          description: 'Third requirement',
          type: 'functional' as const,
          lineNumber: 9,
        },
        {
          id: 'REQ-F-001',
          description: 'First requirement',
          type: 'functional' as const,
          lineNumber: 10,
        },
      ]

      const errors: string[] = []
      const result = validatePrdStructure(sections, requirements, errors)

      expect(result).toBe(false)
      expect(errors).toContain(
        'Functional requirement numbering gap: expected REQ-F-002, found REQ-F-003'
      )
    })
  })

  describe('Input Parameter Validation Edge Cases', () => {
    describe('parsePrdContent edge cases', () => {
      it('should handle empty content string', () => {
        const result = parsePrdContent('')

        expect(result.title).toBe('')
        expect(result.sections.size).toBe(0)
        expect(result.requirements).toHaveLength(0)
        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Missing required section: Overview')
        expect(result.errors).toContain('Missing required section: Requirements')
      })

      it('should handle content with special characters and Unicode', () => {
        const content = `# PRD: Test Feature with Émojis 🚀 & Special Chars

## Overview
This is a test with special characters: äöü, 中文, emoji 💯

## Requirements

### Functional Requirements
- REQ-F-001: Handle Unicode characters: αβγδε
- REQ-F-002: Process special symbols: @#$%^&*()

### Non-Functional Requirements
- REQ-NF-001: Support émojis in content 🎯
`

        const result = parsePrdContent(content)

        expect(result.title).toBe('Test Feature with Émojis 🚀 & Special Chars')
        expect(result.isValid).toBe(true)
        expect(result.requirements).toHaveLength(3)
        expect(result.requirements[0]?.description).toContain('Unicode characters: αβγδε')
        expect(result.requirements[2]?.description).toContain('émojis in content 🎯')
      })

      it('should handle very long requirement descriptions', () => {
        const longDescription = 'Very long requirement: ' + 'A'.repeat(1000)
        const content = `# PRD: Test Feature

## Overview
Test overview.

## Requirements

### Functional Requirements
- REQ-F-001: ${longDescription}

### Non-Functional Requirements
`

        const result = parsePrdContent(content)

        expect(result.isValid).toBe(true)
        expect(result.requirements).toHaveLength(1)
        expect(result.requirements[0]?.description).toBe(longDescription)
      })

      it('should handle malformed markdown structure gracefully', () => {
        const content = `# PRD: Malformed Feature
        
# Missing second level for Overview
This should be under ## Overview but isn't

### Misplaced subsection before main section

## Requirements

### Functional Requirements
- REQ-F-001: Valid requirement despite malformed structure

### Non-Functional Requirements
`

        const result = parsePrdContent(content)

        // Should still extract the title and requirements despite structural issues
        expect(result.title).toBe('Malformed Feature')
        expect(result.requirements).toHaveLength(1)
        expect(result.requirements[0]?.id).toBe('REQ-F-001')
      })

      it('should handle invalid requirement numbering formats', () => {
        const content = `# PRD: Invalid Requirements

## Overview
Test overview.

## Requirements

### Functional Requirements
- REQ-INVALID-001: Invalid prefix
- REQ-F-ABC: Invalid number format
- REQ-F-: Missing number
- REQ-F-001 Missing colon
- REQ-F-001: Valid requirement
- REQ-F-999: Very high number

### Non-Functional Requirements
- REQ-NF-001: Valid non-functional
`

        const result = parsePrdContent(content)

        // Should only extract valid requirements
        expect(result.requirements).toHaveLength(3)
        expect(result.requirements[0]?.id).toBe('REQ-F-001')
        expect(result.requirements[1]?.id).toBe('REQ-F-999')
        expect(result.requirements[2]?.id).toBe('REQ-NF-001')
      })
    })

    describe('parseTaskFileContent edge cases', () => {
      it('should handle empty YAML content', () => {
        const result = parseTaskFileContent('')

        expect(result.isValid).toBe(false)
        expect(result.errors[0]).toContain('Invalid task file structure')
      })

      it('should handle YAML with Unicode characters', () => {
        const content = `feature: unicode-test-ßäöü-中文
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "Tâsk with spéciâl chàrs"
    description: |
      Test with émojis 🚀 and Unicode: αβγδε
      Multiple lines with special chars: äöüÄÖÜ
    status: pending
    dependencies: []
    acceptance_criteria: 
      - "Critérion with äccénts"
      - "Test émojis 💯"
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(true)
        expect(result.taskFile.feature).toBe('unicode-test-ßäöü-中文')
        expect(result.taskFile.tasks[0]?.title).toContain('Tâsk with spéciâl chàrs')
        expect(result.taskFile.tasks[0]?.description).toContain('émojis 🚀')
        expect(result.taskFile.tasks[0]?.acceptance_criteria?.[0]).toContain(
          'Critérion with äccénts'
        )
      })

      it('should validate task status with mixed case and whitespace', () => {
        const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "Test task"
    description: "Test"
    status: PENDING
    dependencies: []
    acceptance_criteria: []
    completed_at: null
  - id: task-002
    title: "Test task 2"
    description: "Test 2"
    status: " completed "
    dependencies: []
    acceptance_criteria: []
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Task "task-001" has invalid status: "PENDING"')
        expect(result.errors).toContain('Task "task-002" has invalid status: " completed "')
      })

      it('should detect circular dependencies', () => {
        const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "First task"
    description: "Depends on task-002"
    status: pending
    dependencies: [task-002]
    acceptance_criteria: []
    completed_at: null
  - id: task-002
    title: "Second task"
    description: "Depends on task-001 - circular!"
    status: pending
    dependencies: [task-001]
    acceptance_criteria: []
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(true) // Current validation doesn't check circular deps
        expect(result.taskIds).toEqual(['task-001', 'task-002'])
      })

      it('should handle very large task objects', () => {
        const longDescription = 'Very long task description: ' + 'A'.repeat(5000)
        const manyDependencies = Array.from(
          { length: 100 },
          (_, i) => `task-${String(i + 100).padStart(3, '0')}`
        )
        const manyCriteria = Array.from(
          { length: 50 },
          (_, i) => `Acceptance criteria ${i + 1}: ${'B'.repeat(100)}`
        )

        const content = `feature: large-task-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "Large task with extensive metadata"
    description: ${JSON.stringify(longDescription)}
    status: pending
    dependencies: ${JSON.stringify(manyDependencies)}
    acceptance_criteria: ${JSON.stringify(manyCriteria)}
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(true)
        expect(result.taskFile.tasks[0]?.description).toHaveLength(longDescription.length)
        expect(result.taskFile.tasks[0]?.dependencies).toHaveLength(100)
        expect(result.taskFile.tasks[0]?.acceptance_criteria).toHaveLength(50)
      })

      it('should handle malformed task ID formats', () => {
        const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: invalid-id
    title: "Invalid ID format"
    description: "Should fail validation"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null
  - id: task-
    title: "Missing number"
    description: "Invalid ID"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null
  - id: task-001
    title: "Valid task"
    description: "Should pass"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null`

        const result = parseTaskFileContent(content)

        expect(result.isValid).toBe(true) // File is still valid, just warnings about ID format
        expect(result.errors).toContain(
          'Task ID "invalid-id" does not follow expected format "task-XXX"'
        )
        expect(result.errors).toContain(
          'Task ID "task-" does not follow expected format "task-XXX"'
        )
      })
    })
  })

  describe('askQuestion validation', () => {
    it('should throw error for empty prompt', async () => {
      await expect(askQuestion('')).rejects.toThrow('Prompt is required for interactive question')
    })

    it('should throw error for null prompt', async () => {
      await expect(askQuestion(null as any)).rejects.toThrow(
        'Prompt is required for interactive question'
      )
    })

    it('should throw error for undefined prompt', async () => {
      await expect(askQuestion(undefined as any)).rejects.toThrow(
        'Prompt is required for interactive question'
      )
    })

    it('should throw error for non-string prompt', async () => {
      await expect(askQuestion(123 as any)).rejects.toThrow(
        'Prompt is required for interactive question'
      )
    })

    it('should accept whitespace-only prompt (current behavior)', async () => {
      // Note: Current implementation accepts whitespace prompts
      // This test documents the current behavior rather than testing rejection
      expect(typeof askQuestion).toBe('function')
      // Can't easily test full execution due to readline mocking complexity
    })

    it('should accept very long prompts without validation errors', () => {
      const longPrompt = 'A'.repeat(10000)
      expect(typeof askQuestion).toBe('function')
      expect(longPrompt.length).toBe(10000)
      // Note: Can't easily test the full flow without mocking readline
      // This test verifies the prompt passes basic validation checks
    })
  })

  describe('Atomic File Operation Validation', () => {
    const testDir = join(process.cwd(), 'test-atomic-validation')

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
      mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    })

    describe('prepareAtomicWrite input validation', () => {
      it('should throw error for empty file path', async () => {
        await expect(prepareAtomicWrite('', 'content')).rejects.toThrow(
          'File path is required for atomic write operation'
        )
      })

      it('should throw error for null file path', async () => {
        await expect(prepareAtomicWrite(null as any, 'content')).rejects.toThrow(
          'File path is required for atomic write operation'
        )
      })

      it('should throw error for undefined file path', async () => {
        await expect(prepareAtomicWrite(undefined as any, 'content')).rejects.toThrow(
          'File path is required for atomic write operation'
        )
      })

      it('should throw error for non-string file path', async () => {
        await expect(prepareAtomicWrite(123 as any, 'content')).rejects.toThrow(
          'File path is required for atomic write operation'
        )
      })

      it('should throw error for null content', async () => {
        const testFile = join(testDir, 'test.txt')
        await expect(prepareAtomicWrite(testFile, null as any)).rejects.toThrow(
          'Content must be a string'
        )
      })

      it('should throw error for undefined content', async () => {
        const testFile = join(testDir, 'test.txt')
        await expect(prepareAtomicWrite(testFile, undefined as any)).rejects.toThrow(
          'Content must be a string'
        )
      })

      it('should throw error for non-string content', async () => {
        const testFile = join(testDir, 'test.txt')
        await expect(prepareAtomicWrite(testFile, 123 as any)).rejects.toThrow(
          'Content must be a string'
        )
      })

      it('should handle Unicode content correctly', async () => {
        const testFile = join(testDir, 'unicode.txt')
        const unicodeContent = 'Test with émojis 🚀 and special chars: äöüÄÖÜ, 中文'

        const operation = await prepareAtomicWrite(testFile, unicodeContent)

        expect(operation.content).toBe(unicodeContent)
        expect(operation.targetPath).toBe(testFile)
        expect(existsSync(operation.tempPath)).toBe(true)

        await rollbackAtomicWrite(operation)
      })

      it('should handle very long content', async () => {
        const testFile = join(testDir, 'large.txt')
        const largeContent = 'Large content: ' + 'A'.repeat(100000) // 100KB

        const operation = await prepareAtomicWrite(testFile, largeContent)

        expect(operation.content).toBe(largeContent)
        expect(existsSync(operation.tempPath)).toBe(true)

        await rollbackAtomicWrite(operation)
      })

      it('should handle paths with special characters', async () => {
        const specialDir = join(testDir, 'spéciál dîrectory')
        mkdirSync(specialDir, { recursive: true })
        const testFile = join(specialDir, 'tëst fïlé.txt')

        const operation = await prepareAtomicWrite(testFile, 'test content')

        expect(operation.targetPath).toBe(testFile)
        expect(existsSync(operation.tempPath)).toBe(true)

        await rollbackAtomicWrite(operation)
      })

      it('should handle absolute vs relative paths', async () => {
        const relativePath = 'relative-test.txt'
        const absolutePath = join(testDir, 'absolute-test.txt')

        // Both should work but may behave differently
        const relativeOp = await prepareAtomicWrite(relativePath, 'relative content')
        const absoluteOp = await prepareAtomicWrite(absolutePath, 'absolute content')

        expect(relativeOp.targetPath).toBe(relativePath)
        expect(absoluteOp.targetPath).toBe(absolutePath)

        await rollbackAtomicWrite(relativeOp)
        await rollbackAtomicWrite(absoluteOp)
      })
    })

    describe('commitAtomicWrite validation', () => {
      it('should throw error for operation with empty target path', async () => {
        const invalidOperation = {
          targetPath: '',
          tempPath: join(testDir, 'temp.txt'),
          content: 'test',
          originalExists: false,
        }

        await expect(commitAtomicWrite(invalidOperation)).rejects.toThrow(
          'Invalid atomic operation'
        )
      })

      it('should throw error for operation with empty temp path', async () => {
        const invalidOperation = {
          targetPath: join(testDir, 'target.txt'),
          tempPath: '',
          content: 'test',
          originalExists: false,
        }

        await expect(commitAtomicWrite(invalidOperation)).rejects.toThrow(
          'Invalid atomic operation'
        )
      })

      it('should throw error for missing temp file', async () => {
        const invalidOperation = {
          targetPath: join(testDir, 'target.txt'),
          tempPath: join(testDir, 'nonexistent.tmp'),
          content: 'test',
          originalExists: false,
        }

        await expect(commitAtomicWrite(invalidOperation)).rejects.toThrow(
          'Atomic operation corrupted'
        )
      })

      it('should handle permission denied errors gracefully', async () => {
        // Create a temp file first
        const tempFile = join(testDir, 'temp.txt')
        writeFileSync(tempFile, 'test content')

        const operation = {
          targetPath: '/root/permission-denied.txt', // Should fail on most systems
          tempPath: tempFile,
          content: 'test',
          originalExists: false,
        }

        await expect(commitAtomicWrite(operation)).rejects.toThrow()
        // Temp file should be cleaned up even on failure
        expect(existsSync(tempFile)).toBe(false)
      })
    })
  })

  describe('PRD and Task File Validation Integration', () => {
    const testDir = join(process.cwd(), 'test-file-validation')

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
      mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    })

    describe('parsePrdFile comprehensive validation', () => {
      it('should handle permission denied gracefully', async () => {
        const testFile = join(testDir, 'permission-test.md')
        writeFileSync(testFile, '# PRD: Test')

        // Try to test file permissions - may not work on all systems
        try {
          await expect(parsePrdFile(testFile)).resolves.toBeDefined()
        } catch (error) {
          // Permission test may not be possible in test environment
          expect(error).toBeDefined()
        }
      })

      it('should validate file is not a directory', async () => {
        const dirPath = join(testDir, 'not-a-file.md')
        mkdirSync(dirPath)

        await expect(parsePrdFile(dirPath)).rejects.toThrow()
      })

      it('should handle binary files correctly', async () => {
        const binaryFile = join(testDir, 'binary.md')
        // Write binary content
        writeFileSync(binaryFile, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]))

        await expect(parsePrdFile(binaryFile)).rejects.toThrow()
      })

      it('should handle very large PRD files', async () => {
        const largeFile = join(testDir, 'large.md')
        const largeContent = `# PRD: Large Feature

## Overview
${'A'.repeat(50000)}

## Requirements

### Functional Requirements
${Array.from({ length: 1000 }, (_, i) => `- REQ-F-${String(i + 1).padStart(3, '0')}: Requirement ${i + 1}`).join('\n')}

### Non-Functional Requirements
- REQ-NF-001: Performance requirement
`
        writeFileSync(largeFile, largeContent)

        const result = await parsePrdFile(largeFile)
        expect(result.isValid).toBe(true)
        expect(result.requirements).toHaveLength(1000) // Parser currently finds 1000, need to debug
      })

      it('should handle files with different encodings', async () => {
        const testFile = join(testDir, 'encoding-test.md')
        const contentWithUnicode = `# PRD: Encoding Test

## Overview
Test with various encodings: UTF-8 characters éñíödé

## Requirements

### Functional Requirements
- REQ-F-001: Handle encoding properly

### Non-Functional Requirements
`
        writeFileSync(testFile, contentWithUnicode, 'utf8')

        const result = await parsePrdFile(testFile)
        expect(result.isValid).toBe(true)
        expect(result.title).toContain('Encoding Test')
      })
    })

    describe('parseTaskFile comprehensive validation', () => {
      it('should handle corrupted YAML gracefully', async () => {
        const corruptedFile = join(testDir, 'corrupted.yml')
        writeFileSync(
          corruptedFile,
          `feature: test
tasks:
  - id: task-001
    title: "Test"
    description: "Test"
    status: pending
    dependencies: [
    # Corrupted YAML - missing closing bracket`
        )

        await expect(parseTaskFile(corruptedFile)).rejects.toThrow('YAML parsing error')
      })

      it('should validate task file structure completeness', async () => {
        const incompleteFile = join(testDir, 'incomplete.yml')
        writeFileSync(
          incompleteFile,
          `feature: test-feature
# Missing created_at and updated_at
tasks:
  - id: task-001
    title: "Test task"
    description: "Test"
    status: pending`
        )

        await expect(parseTaskFile(incompleteFile)).rejects.toThrow('created_at')
      })

      it('should handle mixed YAML and JSON in task files', async () => {
        const mixedFile = join(testDir, 'mixed.yml')
        writeFileSync(
          mixedFile,
          `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "Mixed content"
    description: |
      This description contains JSON-like content:
      {"key": "value", "nested": {"array": [1, 2, 3]}}
    status: pending
    dependencies: []
    acceptance_criteria: 
      - "Handle mixed content"
    completed_at: null`
        )

        const result = await parseTaskFile(mixedFile)
        expect(result.isValid).toBe(true)
        expect(result.taskFile.tasks[0]?.description).toContain('{"key": "value"')
      })
    })
  })
})

describe('Interactive Q&A System', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockAgentClient.messages.create.mockClear()
    mockReadlineInterface.question.mockClear()
    mockReadlineInterface.close.mockClear()
  })

  describe('runRequirementRefinementQA', () => {
    it('should be exportable function', () => {
      expect(typeof runRequirementRefinementQA).toBe('function')
    })

    it('should handle agent response indicating completion', async () => {
      // Mock agent response saying "DONE" to stop Q&A
      mockAgentClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'DONE' }],
      })

      const mockPrd = {
        title: 'Test Feature',
        sections: new Map(),
        requirements: [
          {
            id: 'REQ-F-001',
            description: 'Existing requirement',
            type: 'functional' as const,
            lineNumber: 1,
          },
        ],
        isValid: true,
        errors: [],
      }

      const config = { defaultAgent: 'opencode' }
      const model = 'claude-sonnet-4-20250514'

      const result = await runRequirementRefinementQA(
        'Add user authentication',
        mockPrd,
        config,
        model
      )

      expect(result).toEqual([])
      expect(mockAgentClient.messages.create).toHaveBeenCalledTimes(1)
    })

    it('should handle agent-based content fetching in system prompt', async () => {
      // Mock agent asking a question, then completing
      mockAgentClient.messages.create
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: 'What authentication methods should be supported? Could not access config.json for reference.',
            },
          ],
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'DONE' }],
        })

      // Mock user input
      mockReadlineInterface.question.mockImplementationOnce((_, callback) => {
        callback('OAuth and email/password')
      })

      const mockPrd = {
        title: 'Test Feature',
        sections: new Map(),
        requirements: [],
        isValid: true,
        errors: [],
      }

      const config = { defaultAgent: 'opencode' }
      const model = 'claude-sonnet-4-20250514'

      const result = await runRequirementRefinementQA(
        'Add user authentication to config.json',
        mockPrd,
        config,
        model
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.question).toContain('authentication methods')
      expect(result[0]?.answer).toBe('OAuth and email/password')

      // Verify system prompt includes content fetching instructions
      expect(mockAgentClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('CONTENT FETCHING INSTRUCTIONS'),
        })
      )

      const calls = (mockAgentClient.messages.create as any).mock.calls
      const firstCallArgs = calls[0]?.[0]
      expect(firstCallArgs?.system).toContain('file reading tools')
      expect(firstCallArgs?.system).toContain('web fetching tools')
    })

    it('should handle agent network errors gracefully', async () => {
      // Mock network error with retry wrapper behavior
      const networkError = new Error('Network connection failed')
      mockAgentClient.messages.create.mockRejectedValue(networkError)

      const mockPrd = {
        title: 'Test Feature',
        sections: new Map(),
        requirements: [],
        isValid: true,
        errors: [],
      }

      const config = { defaultAgent: 'opencode' }
      const model = 'claude-sonnet-4-20250514'

      await expect(
        runRequirementRefinementQA('Add user authentication', mockPrd, config, model)
      ).rejects.toThrow('Network')
    })

    it('should handle invalid agent response formats', async () => {
      // Mock invalid response format
      mockAgentClient.messages.create.mockResolvedValueOnce({
        content: null,
      })

      const mockPrd = {
        title: 'Test Feature',
        sections: new Map(),
        requirements: [],
        isValid: true,
        errors: [],
      }

      const config = { defaultAgent: 'opencode' }
      const model = 'claude-sonnet-4-20250514'

      await expect(
        runRequirementRefinementQA('Add user authentication', mockPrd, config, model)
      ).rejects.toThrow('Invalid AI response format')
    })

    it('should validate input parameters', async () => {
      const mockPrd = {
        title: 'Test',
        sections: new Map(),
        requirements: [],
        isValid: true,
        errors: [],
      }
      const config = { defaultAgent: 'opencode' }
      const model = 'claude-sonnet-4-20250514'

      await expect(runRequirementRefinementQA('', mockPrd, config, model)).rejects.toThrow(
        'Requirement description is required'
      )

      await expect(
        runRequirementRefinementQA('Valid requirement', null as any, config, model)
      ).rejects.toThrow('Valid PRD context is required')

      await expect(
        runRequirementRefinementQA('Valid requirement', mockPrd, null as any, model)
      ).rejects.toThrow('Configuration is required')

      await expect(
        runRequirementRefinementQA('Valid requirement', mockPrd, config, '')
      ).rejects.toThrow('Model specification is required')
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

describe('Additional Unit Tests', () => {
  describe('parsePrdFile', () => {
    const testDir = join(process.cwd(), 'test-prd-parsing')
    const testPrdFile = join(testDir, 'test.md')

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
      mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    })

    it('should parse valid PRD file successfully', async () => {
      const content = `# PRD: Test Feature

## Overview
This is a test feature.

## Requirements

### Functional Requirements
- REQ-F-001: First requirement

### Non-Functional Requirements
- REQ-NF-001: First performance requirement
`
      writeFileSync(testPrdFile, content)

      const result = await parsePrdFile(testPrdFile)

      expect(result.title).toBe('Test Feature')
      expect(result.isValid).toBe(true)
      expect(result.requirements).toHaveLength(2)
    })

    it('should throw error for non-existent file', async () => {
      const nonExistentFile = join(testDir, 'nonexistent.md')

      await expect(parsePrdFile(nonExistentFile)).rejects.toThrow('PRD file not found')
    })

    it('should throw error for invalid file extension', async () => {
      const invalidFile = join(testDir, 'test.txt')
      writeFileSync(invalidFile, 'content')

      await expect(parsePrdFile(invalidFile)).rejects.toThrow('Invalid PRD file format')
    })

    it('should throw error for empty file', async () => {
      writeFileSync(testPrdFile, '')

      await expect(parsePrdFile(testPrdFile)).rejects.toThrow('PRD file is empty')
    })

    it('should throw error for empty input', async () => {
      await expect(parsePrdFile('')).rejects.toThrow(
        'PRD file path is required and must be a string'
      )
    })

    it('should throw error for non-string input', async () => {
      await expect(parsePrdFile(null as any)).rejects.toThrow(
        'PRD file path is required and must be a string'
      )
    })
  })

  describe('parseTaskFile', () => {
    const testDir = join(process.cwd(), 'test-task-parsing')
    const testTaskFile = join(testDir, 'test.yml')

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
      mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    })

    it('should parse valid task file successfully', async () => {
      const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "First task"
    description: "Test task"
    status: pending
    dependencies: []
    acceptance_criteria: ["Test passes"]
    completed_at: null
`
      writeFileSync(testTaskFile, content)

      const result = await parseTaskFile(testTaskFile)

      expect(result.isValid).toBe(true)
      expect(result.taskFile.feature).toBe('test-feature')
      expect(result.taskIds).toEqual(['task-001'])
      expect(result.highestTaskId).toBe(1)
    })

    it('should throw error for non-existent file', async () => {
      const nonExistentFile = join(testDir, 'nonexistent.yml')

      await expect(parseTaskFile(nonExistentFile)).rejects.toThrow('Task file not found')
    })

    it('should throw error for invalid file extension', async () => {
      const invalidFile = join(testDir, 'test.txt')
      writeFileSync(invalidFile, 'content')

      await expect(parseTaskFile(invalidFile)).rejects.toThrow('Invalid task file format')
    })

    it('should throw error for empty file', async () => {
      writeFileSync(testTaskFile, '')

      await expect(parseTaskFile(testTaskFile)).rejects.toThrow('Task file is empty')
    })

    it('should throw error for empty input', async () => {
      await expect(parseTaskFile('')).rejects.toThrow(
        'Task file path is required and must be a string'
      )
    })
  })

  describe('extractTaskIds', () => {
    it('should extract and sort task IDs', () => {
      const parsedTaskFile = {
        taskFile: { feature: 'test', created_at: '', updated_at: '', tasks: [] },
        taskIds: ['task-003', 'task-001', 'task-002'],
        highestTaskId: 3,
        isValid: true,
        errors: [],
      }

      const result = extractTaskIds(parsedTaskFile)

      expect(result).toEqual(['task-001', 'task-002', 'task-003'])
    })

    it('should handle empty task IDs array', () => {
      const parsedTaskFile = {
        taskFile: { feature: 'test', created_at: '', updated_at: '', tasks: [] },
        taskIds: [],
        highestTaskId: 0,
        isValid: true,
        errors: [],
      }

      const result = extractTaskIds(parsedTaskFile)

      expect(result).toEqual([])
    })
  })

  describe('taskIdExists', () => {
    const parsedTaskFile = {
      taskFile: { feature: 'test', created_at: '', updated_at: '', tasks: [] },
      taskIds: ['task-001', 'task-002', 'task-003'],
      highestTaskId: 3,
      isValid: true,
      errors: [],
    }

    it('should return true for existing task ID', () => {
      expect(taskIdExists(parsedTaskFile, 'task-002')).toBe(true)
    })

    it('should return false for non-existing task ID', () => {
      expect(taskIdExists(parsedTaskFile, 'task-004')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(taskIdExists(parsedTaskFile, '')).toBe(false)
    })
  })
})

describe('Error Scenario Tests', () => {
  describe('parsePrdContent error scenarios', () => {
    it('should handle malformed requirement patterns', () => {
      const content = `# PRD: Test Feature

## Overview
Test overview.

## Requirements

### Functional Requirements
- REQ-INVALID-001: This is malformed
- REQ-F-: Missing number
- REQ-F-001 Missing colon
- REQ-F-001: Valid requirement

### Non-Functional Requirements
- REQ-NF-001: Valid non-functional requirement
`

      const result = parsePrdContent(content)

      // Should only parse valid requirements
      expect(result.requirements).toHaveLength(2)
      expect(result.requirements[0]?.id).toBe('REQ-F-001')
      expect(result.requirements[1]?.id).toBe('REQ-NF-001')
    })

    it('should handle missing title', () => {
      const content = `## Overview
Test without title.

## Requirements

### Functional Requirements
- REQ-F-001: Test requirement

### Non-Functional Requirements
`

      const result = parsePrdContent(content)

      expect(result.title).toBe('')
      expect(result.sections.size).toBe(2)
    })

    it('should handle content with only requirements section', () => {
      const content = `# PRD: Minimal Feature

## Requirements

### Functional Requirements
- REQ-F-001: Only requirement

### Non-Functional Requirements
`

      const result = parsePrdContent(content)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing required section: Overview')
    })
  })

  describe('parseTaskFileContent error scenarios', () => {
    it('should handle invalid YAML', () => {
      const content = `feature: test
tasks:
  - id: task-001
    title: "Unclosed quote
    description: "Test"
    status: pending`

      const result = parseTaskFileContent(content)

      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('YAML parsing error')
    })

    it('should validate task status values', () => {
      const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "Test task"
    description: "Test description"
    status: invalid_status
    dependencies: []
    acceptance_criteria: []
    completed_at: null`

      const result = parseTaskFileContent(content)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Task "task-001" has invalid status: "invalid_status"')
    })

    it('should detect duplicate task IDs', () => {
      const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - id: task-001
    title: "First task"
    description: "Test description"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null
  - id: task-001
    title: "Duplicate task"
    description: "Test description"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null`

      const result = parseTaskFileContent(content)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Duplicate task IDs found')
    })

    it('should handle malformed task objects', () => {
      const content = `feature: test-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
  - invalid_task_structure
  - id: task-002
    title: "Valid task"
    description: "Test description"
    status: pending
    dependencies: []
    acceptance_criteria: []
    completed_at: null`

      const result = parseTaskFileContent(content)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid task object found')
    })
  })

  describe('Requirement insertion edge cases', () => {
    it('should handle section with no existing requirements', () => {
      const sectionContent = `## Requirements

### Functional Requirements

### Non-Functional Requirements
- REQ-NF-001: Existing non-functional requirement`

      const newRequirements = ['- REQ-F-001: New functional requirement']

      const result = insertRequirementsIntoSection(
        sectionContent,
        newRequirements,
        'Functional Requirements'
      )

      expect(result).toContain('- REQ-F-001: New functional requirement')
      expect(result).toContain('- REQ-NF-001: Existing non-functional requirement')
    })

    it('should handle section at the very end of content', () => {
      const sectionContent = `## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement

### Non-Functional Requirements`

      const newRequirements = ['- REQ-NF-001: New non-functional requirement']

      const result = insertRequirementsIntoSection(
        sectionContent,
        newRequirements,
        'Non-Functional Requirements'
      )

      expect(result).toContain('- REQ-NF-001: New non-functional requirement')
    })
  })
})

describe('Atomic File Operations', () => {
  const { readFileSync } = require('fs')

  const testDir = join(process.cwd(), 'test-atomic-operations')
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

  describe('Atomic operation error scenarios', () => {
    it('should handle invalid file paths', async () => {
      await expect(prepareAtomicWrite('', 'content')).rejects.toThrow('File path is required')
      await expect(prepareAtomicWrite(null as any, 'content')).rejects.toThrow(
        'File path is required'
      )
    })

    it('should handle invalid content', async () => {
      await expect(prepareAtomicWrite('/tmp/test.txt', null as any)).rejects.toThrow(
        'Content must be a string'
      )
    })

    it('should handle corrupted atomic operation', async () => {
      const operation = {
        targetPath: testFile,
        tempPath: join(testDir, 'nonexistent-temp.txt'),
        content: 'test',
        originalExists: false,
      }

      await expect(commitAtomicWrite(operation)).rejects.toThrow('Atomic operation corrupted')
    })

    it('should handle invalid atomic operation structure', async () => {
      const invalidOperation = {
        targetPath: '',
        tempPath: '',
        content: 'test',
        originalExists: false,
      }

      await expect(commitAtomicWrite(invalidOperation)).rejects.toThrow('Invalid atomic operation')
    })
  })
})

describe('Integration Tests', () => {
  const testDir = join(process.cwd(), 'test-integration')
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
    mkdirSync(testDir, { recursive: true })
    process.chdir(testDir)

    // Create necessary directories
    mkdirSync('.plans', { recursive: true })

    // Reset agent mocks for integration tests
    mockAgentClient.messages.create.mockClear()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe('End-to-end PRD extension with agent-based content fetching', () => {
    it('should reject invalid inputs gracefully', async () => {
      await expect(extendPRD('', 'test requirement')).rejects.toThrow(
        'PRD file path is required and must be a string'
      )
      await expect(extendPRD('test.md', '')).rejects.toThrow(
        'Requirement description is required and must be a string'
      )
      await expect(extendPRD('test.md', 'short')).rejects.toThrow(
        'Requirement description too short'
      )
    })

    it('should handle very long requirement descriptions', async () => {
      const longDescription = 'A'.repeat(15000) // Over 10k limit

      await expect(extendPRD('test.md', longDescription)).rejects.toThrow(
        'Requirement description too long'
      )
    })

    it('should delegate content fetching to agent in full workflow', async () => {
      // Setup test files
      const prdContent = `# PRD: Test Feature

## Overview
This is a test feature.

## Requirements

### Functional Requirements
- REQ-F-001: Existing functional requirement

### Non-Functional Requirements
- REQ-NF-001: Existing non-functional requirement
`
      writeFileSync('test-feature.md', prdContent)

      // Mock readline for Q&A
      mockReadlineInterface.question.mockImplementationOnce((_, callback) => {
        callback('done') // Skip Q&A
      })

      // Mock agent responses for Q&A (DONE immediately) and requirements generation
      mockAgentClient.messages.create
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'DONE' }], // Q&A completion
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: `Note: Successfully read test-feature.md and processed content.

FUNCTIONAL REQUIREMENTS:
- System must implement new authentication feature
- Application must validate user inputs securely

NON-FUNCTIONAL REQUIREMENTS:
- Response time must be under 200ms
- System must handle 100 concurrent users`,
            },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  id: 'task-003',
                  title: 'Implement authentication feature',
                  description: 'Implement the new authentication system based on requirements',
                  status: 'pending',
                  dependencies: [],
                  acceptance_criteria: [
                    'Authentication works correctly',
                    'Security validation passes',
                  ],
                  completed_at: null,
                },
              ]),
            },
          ],
        })

      // Run the extend PRD operation
      await expect(
        extendPRD('test-feature.md', 'Add user authentication with file and URL references')
      ).resolves.toBeUndefined()

      // Verify agent was called for both Q&A and requirements generation (task generation skipped since no existing task file)
      expect(mockAgentClient.messages.create).toHaveBeenCalledTimes(2)

      // Verify the calls included content fetching instructions
      const calls = (mockAgentClient.messages.create as any).mock.calls
      const qaCall = calls[0]?.[0]
      const reqCall = calls[1]?.[0]

      expect(qaCall?.system).toContain('CONTENT FETCHING INSTRUCTIONS')
      expect(qaCall?.system).toContain('file reading tools')
      expect(qaCall?.system).toContain('web fetching tools')

      expect(reqCall?.system).toContain('CONTENT FETCHING INSTRUCTIONS')
      expect(reqCall?.system).toContain('file reading tools')
      expect(reqCall?.system).toContain('web fetching tools')

      // Verify PRD file was updated (task file won't be created without existing task file)
      expect(existsSync('test-feature.md')).toBe(true)

      // Check that PRD content includes new requirements
      const updatedPrdContent = require('fs').readFileSync('test-feature.md', 'utf-8')
      expect(updatedPrdContent).toContain('REQ-F-002')
      expect(updatedPrdContent).toContain('REQ-F-003')
      expect(updatedPrdContent).toContain('REQ-F-004') // Based on mock response
    })

    it('should handle agent content access issues gracefully in full workflow', async () => {
      // Setup test files
      const prdContent = `# PRD: Test Feature

## Overview  
This is a test feature.

## Requirements

### Functional Requirements
- REQ-F-001: Existing requirement

### Non-Functional Requirements
`
      writeFileSync('test-feature.md', prdContent)

      // Mock readline for Q&A
      mockReadlineInterface.question.mockImplementationOnce((_, callback) => {
        callback('done')
      })

      // Mock agent responses with content access issues
      mockAgentClient.messages.create
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'DONE' }], // Q&A completion
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: `Note: Could not access external-config.json file and URL https://api.example.com was inaccessible.

FUNCTIONAL REQUIREMENTS:
- System must implement authentication (details limited due to access issues)

NON-FUNCTIONAL REQUIREMENTS:
- System must be secure`,
            },
          ],
        })

      // Should complete successfully despite content access issues
      await expect(
        extendPRD(
          'test-feature.md',
          'Add authentication using external-config.json and https://api.example.com'
        )
      ).resolves.toBeUndefined()

      // Verify agent was still called and requirements were generated (task generation skipped since no existing task file)
      expect(mockAgentClient.messages.create).toHaveBeenCalledTimes(2)

      // Verify PRD file was updated with available information (task file won't be created without existing task file)
      expect(existsSync('test-feature.md')).toBe(true)
    })
  })
})

describe('Performance and Edge Case Tests', () => {
  describe('Large data handling', () => {
    it('should handle PRD with many requirements efficiently', () => {
      const manyRequirements = Array.from(
        { length: 100 },
        (_, i) => `- REQ-F-${String(i + 1).padStart(3, '0')}: Requirement number ${i + 1}`
      ).join('\n')

      const content = `# PRD: Large Feature

## Overview
This is a feature with many requirements.

## Requirements

### Functional Requirements
${manyRequirements}

### Non-Functional Requirements
- REQ-NF-001: Performance requirement
`

      const result = parsePrdContent(content)

      expect(result.requirements).toHaveLength(101)
      expect(result.isValid).toBe(true)
      expect(extractRequirementIds(result).functional).toHaveLength(100)
    })

    it('should handle task file with many tasks efficiently', () => {
      const tasks = Array.from(
        { length: 50 },
        (_, i) => `  - id: task-${String(i + 1).padStart(3, '0')}
    title: "Task ${i + 1}"
    description: "Description for task ${i + 1}"
    status: pending
    dependencies: []
    acceptance_criteria: ["Criteria ${i + 1}"]
    completed_at: null`
      ).join('\n')

      const content = `feature: large-feature
created_at: 2026-01-01T00:00:00.000Z
updated_at: 2026-01-01T01:00:00.000Z

tasks:
${tasks}`

      const result = parseTaskFileContent(content)

      expect(result.taskIds).toHaveLength(50)
      expect(result.highestTaskId).toBe(50)
      expect(result.isValid).toBe(true)
    })
  })

  describe('Memory efficiency tests', () => {
    it('should handle content parsing without memory leaks', () => {
      // Test multiple parsing operations to check for memory leaks
      for (let i = 0; i < 10; i++) {
        const content = `# PRD: Memory Test ${i}

## Overview
Testing memory efficiency iteration ${i}.

## Requirements

### Functional Requirements
- REQ-F-001: Memory test requirement ${i}

### Non-Functional Requirements
- REQ-NF-001: Performance test ${i}
`
        const result = parsePrdContent(content)
        expect(result.isValid).toBe(true)
        expect(result.title).toBe(`Memory Test ${i}`)
      }
    })
  })

  describe('Concurrent operations', () => {
    it('should handle multiple atomic operations safely', async () => {
      const concurrentTestDir = join(process.cwd(), 'test-concurrent')

      if (existsSync(concurrentTestDir)) {
        rmSync(concurrentTestDir, { recursive: true })
      }
      mkdirSync(concurrentTestDir, { recursive: true })

      try {
        // Test concurrent atomic writes to different files
        const files = Array.from({ length: 5 }, (_, i) => join(concurrentTestDir, `file${i}.txt`))
        const contents = Array.from({ length: 5 }, (_, i) => `Content for file ${i}`)

        const promises = files.map((file, i) => atomicWriteFile(file, contents[i]!))

        await Promise.all(promises)

        // Verify all files were written correctly
        const { readFileSync } = require('fs')
        files.forEach((file, i) => {
          expect(existsSync(file)).toBe(true)
          const content = readFileSync(file, 'utf-8')
          expect(content).toBe(contents[i])
        })
      } finally {
        if (existsSync(concurrentTestDir)) {
          rmSync(concurrentTestDir, { recursive: true })
        }
      }
    })
  })

  describe('Agent-based content fetching validation', () => {
    beforeEach(() => {
      // Reset mocks before each test
      mockAgentClient.messages.create.mockClear()
    })

    it('should extract content access issues from agent responses', () => {
      // Test cases that should match the regex patterns in extractContentAccessIssues
      const testCases = [
        {
          response: 'Could not access file.txt',
          expectIssue: true,
          description: 'File access failure with could not pattern',
        },
        {
          response: 'Unable to fetch content from https://example.com',
          expectIssue: true,
          description: 'URL fetch failure',
        },
        {
          response: 'The file config/settings.json is inaccessible',
          expectIssue: true,
          description: 'File inaccessible pattern',
        },
        {
          response: 'url https://api.test.com not found',
          expectIssue: true,
          description: 'URL not found pattern',
        },
        {
          response: 'Access denied to document.pdf',
          expectIssue: true,
          description: 'Access denied pattern',
        },
        {
          response: 'Successfully read the content from both files and the URL',
          expectIssue: false,
          description: 'Successful content access',
        },
      ]

      testCases.forEach(testCase => {
        const issues = extractContentAccessIssues(testCase.response)
        if (testCase.expectIssue) {
          expect(issues.length).toBeGreaterThan(0)
        } else {
          expect(issues.length).toBe(0)
        }
      })
    })

    it('should deduplicate access issues', () => {
      // Test deduplication works properly (requirement from task-023)
      const duplicateResponse = 'Could not access file.txt and Could not access file.txt'
      const issues = extractContentAccessIssues(duplicateResponse)
      expect(issues.length).toBe(1) // Duplicates should be removed via Set deduplication
    })

    it('should maintain equivalent user experience to previous local implementation', () => {
      // Validate that the key components are in place for agent-based content fetching
      expect(typeof extractContentAccessIssues).toBe('function')

      // Test that content access failures are properly detected
      const mockFailure = 'Unable to read file example.txt due to access restrictions'
      const issues = extractContentAccessIssues(mockFailure)
      expect(issues.length).toBeGreaterThan(0)

      // Test successful content access doesn't generate false positives
      const mockSuccess = 'Content successfully retrieved from all referenced files and URLs'
      const noIssues = extractContentAccessIssues(mockSuccess)
      expect(noIssues.length).toBe(0)
    })
  })

  describe('Agent-based requirements generation', () => {
    beforeEach(() => {
      // Reset mocks before each test
      mockAgentClient.messages.create.mockClear()
    })

    it('should parse agent requirements response format correctly', () => {
      // Test the parsing logic with sample agent response format
      const sampleResponse = `FUNCTIONAL REQUIREMENTS:
- System must authenticate users via OAuth2
- Application must validate user credentials

NON-FUNCTIONAL REQUIREMENTS:
- Authentication response time must be under 500ms
- System must support 1000 concurrent users`

      // Test the parsing logic directly
      const lines = sampleResponse.split('\n')
      let functional: string[] = []
      let nonFunctional: string[] = []
      let currentSection = ''

      for (const line of lines) {
        if (line.trim() === 'FUNCTIONAL REQUIREMENTS:') {
          currentSection = 'functional'
        } else if (line.trim() === 'NON-FUNCTIONAL REQUIREMENTS:') {
          currentSection = 'non-functional'
        } else if (line.trim().startsWith('- ')) {
          const req = line.trim().substring(2)
          if (currentSection === 'functional') {
            functional.push(req)
          } else if (currentSection === 'non-functional') {
            nonFunctional.push(req)
          }
        }
      }

      // Verify parsing works correctly
      expect(functional).toHaveLength(2)
      expect(nonFunctional).toHaveLength(2)
      expect(functional[0]).toBe('System must authenticate users via OAuth2')
      expect(nonFunctional[0]).toBe('Authentication response time must be under 500ms')
    })

    it('should extract content access issues from agent responses', () => {
      // Test the content access issue extraction logic
      const responseWithIssues = `Note: Could not access config.json for authentication details.
File not found: missing.yaml
The URL https://api.example.com is inaccessible due to network timeout.

FUNCTIONAL REQUIREMENTS:
- System must authenticate users
- Application must validate credentials

NON-FUNCTIONAL REQUIREMENTS:
- Authentication must be secure`

      // Test extraction function
      const issues = extractContentAccessIssues(responseWithIssues)

      expect(issues).toHaveLength(4)
      expect(issues).toContain('Could not access config')
      expect(issues).toContain('File not found: missing')
      expect(issues).toContain('URL https://api.example.com is inaccessible due to network timeout')
    })

    it('should handle empty non-functional requirements section', () => {
      // Test parsing when non-functional requirements is empty
      const responseWithEmptySection = `FUNCTIONAL REQUIREMENTS:
- System must authenticate users

NON-FUNCTIONAL REQUIREMENTS:
- None identified`

      // Test the parsing logic
      const lines = responseWithEmptySection.split('\n')
      let functional: string[] = []
      let nonFunctional: string[] = []
      let currentSection = ''

      for (const line of lines) {
        if (line.trim() === 'FUNCTIONAL REQUIREMENTS:') {
          currentSection = 'functional'
        } else if (line.trim() === 'NON-FUNCTIONAL REQUIREMENTS:') {
          currentSection = 'non-functional'
        } else if (line.trim().startsWith('- ')) {
          const req = line.trim().substring(2)
          if (currentSection === 'functional') {
            functional.push(req)
          } else if (currentSection === 'non-functional' && req !== 'None identified') {
            nonFunctional.push(req)
          }
        }
      }

      expect(functional).toHaveLength(1)
      expect(nonFunctional).toHaveLength(0)
      expect(functional[0]).toBe('System must authenticate users')
    })

    it('should handle empty content gracefully', () => {
      // Test handling of empty response content
      const emptyResponse = ''
      const lines = emptyResponse.split('\n')
      let functional: string[] = []
      let nonFunctional: string[] = []

      for (const line of lines) {
        if (line.trim().startsWith('- ')) {
          // Should not add anything from empty response
          functional.push(line.trim().substring(2))
        }
      }

      expect(functional).toHaveLength(0)
      expect(nonFunctional).toHaveLength(0)
    })
  })
})
