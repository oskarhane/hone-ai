import { describe, it, expect } from 'bun:test'
import {
  parsePrdContent,
  extractRequirementIds,
  getNextRequirementId,
  runRequirementRefinementQA,
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
