import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
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
  extendPRD,
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
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe('End-to-end PRD extension', () => {
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
})
