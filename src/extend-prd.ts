import { readFile, access } from 'fs/promises'

// PRD Section Types
export interface PrdSection {
  title: string
  content: string
  startLine: number
  endLine: number
}

export interface PrdRequirement {
  id: string
  description: string
  type: 'functional' | 'non-functional'
  lineNumber: number
}

export interface ParsedPrd {
  title: string
  sections: Map<string, PrdSection>
  requirements: PrdRequirement[]
  isValid: boolean
  errors: string[]
}

const REQUIRED_SECTIONS = ['Overview', 'Requirements']

// Requirement ID patterns
const ANY_REQ_PATTERN = /^\s*-?\s*REQ-(F|NF)-(\d{3}):\s*(.+)$/

/**
 * Parse PRD markdown file and extract structure
 * @param content PRD file content as string
 * @returns ParsedPrd object with sections, requirements, and validation results
 */
export function parsePrdContent(content: string): ParsedPrd {
  const lines = content.split('\n')
  const sections = new Map<string, PrdSection>()
  const requirements: PrdRequirement[] = []
  const errors: string[] = []

  let title = ''
  let currentSection: string | null = null
  let currentSectionContent: string[] = []
  let currentSectionStartLine = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || ''
    const lineNum = i + 1

    // Extract PRD title (first H1 heading)
    if (!title && line.startsWith('# ')) {
      title = line.substring(2).trim()
      if (title.startsWith('PRD: ')) {
        title = title.substring(5).trim()
      }
      continue
    }

    // Detect section headers (H2 level)
    if (line.startsWith('## ')) {
      // Save previous section if exists
      if (currentSection && currentSectionStartLine !== -1) {
        sections.set(currentSection, {
          title: currentSection,
          content: currentSectionContent.join('\n').trim(),
          startLine: currentSectionStartLine,
          endLine: i,
        })
      }

      // Start new section
      currentSection = line.substring(3).trim()
      currentSectionContent = []
      currentSectionStartLine = lineNum
      continue
    }

    // Detect subsection headers (H3 level) - for Requirements subsections
    if (line.startsWith('### ')) {
      const subsectionTitle = line.substring(4).trim()

      // Handle Requirements subsections specially
      if (currentSection === 'Requirements') {
        if (
          subsectionTitle === 'Functional Requirements' ||
          subsectionTitle === 'Non-Functional Requirements'
        ) {
          currentSectionContent.push(line)
          continue
        }
      }

      currentSectionContent.push(line)
      continue
    }

    // Extract requirements
    const reqMatch = line.match(ANY_REQ_PATTERN)
    if (reqMatch && reqMatch[1] && reqMatch[2] && reqMatch[3]) {
      const [, type, number, description] = reqMatch
      const reqType = type === 'F' ? 'functional' : 'non-functional'

      requirements.push({
        id: `REQ-${type}-${number}`,
        description: description.trim(),
        type: reqType,
        lineNumber: lineNum,
      })
    }

    // Add line to current section content
    if (currentSection && line !== '') {
      currentSectionContent.push(line)
    } else if (currentSection) {
      // Preserve empty lines within sections
      currentSectionContent.push('')
    }
  }

  // Save the last section
  if (currentSection && currentSectionStartLine !== -1) {
    sections.set(currentSection, {
      title: currentSection,
      content: currentSectionContent.join('\n').trim(),
      startLine: currentSectionStartLine,
      endLine: lines.length,
    })
  }

  // Validate PRD structure
  const isValid = validatePrdStructure(sections, requirements, errors)

  return {
    title,
    sections,
    requirements,
    isValid,
    errors,
  }
}

/**
 * Validate PRD structure and content
 * @param sections Map of section title to PrdSection
 * @param requirements Array of parsed requirements
 * @param errors Array to collect validation errors
 * @returns boolean indicating if PRD is valid
 */
function validatePrdStructure(
  sections: Map<string, PrdSection>,
  requirements: PrdRequirement[],
  errors: string[]
): boolean {
  let isValid = true

  // Check for required sections
  for (const requiredSection of REQUIRED_SECTIONS) {
    if (!sections.has(requiredSection)) {
      errors.push(`Missing required section: ${requiredSection}`)
      isValid = false
    }
  }

  // Validate Requirements section structure
  if (sections.has('Requirements')) {
    const reqSection = sections.get('Requirements')
    if (reqSection) {
      const hasFunc = reqSection.content.includes('### Functional Requirements')
      const hasNonFunc = reqSection.content.includes('### Non-Functional Requirements')

      if (!hasFunc) {
        errors.push('Requirements section missing "### Functional Requirements" subsection')
        isValid = false
      }

      if (!hasNonFunc) {
        errors.push('Requirements section missing "### Non-Functional Requirements" subsection')
        isValid = false
      }
    }
  }

  // Validate requirement numbering
  const funcReqs = requirements
    .filter(r => r.type === 'functional')
    .sort((a, b) => a.id.localeCompare(b.id))
  const nonFuncReqs = requirements
    .filter(r => r.type === 'non-functional')
    .sort((a, b) => a.id.localeCompare(b.id))

  // Check functional requirement numbering
  for (let i = 0; i < funcReqs.length; i++) {
    const expected = `REQ-F-${String(i + 1).padStart(3, '0')}`
    const req = funcReqs[i]
    if (req && req.id !== expected) {
      errors.push(`Functional requirement numbering gap: expected ${expected}, found ${req.id}`)
      isValid = false
    }
  }

  // Check non-functional requirement numbering
  for (let i = 0; i < nonFuncReqs.length; i++) {
    const expected = `REQ-NF-${String(i + 1).padStart(3, '0')}`
    const req = nonFuncReqs[i]
    if (req && req.id !== expected) {
      errors.push(`Non-functional requirement numbering gap: expected ${expected}, found ${req.id}`)
      isValid = false
    }
  }

  return isValid
}

/**
 * Extract existing requirement IDs from PRD
 * @param prd ParsedPrd object
 * @returns Object with arrays of functional and non-functional requirement IDs
 */
export function extractRequirementIds(prd: ParsedPrd): {
  functional: string[]
  nonFunctional: string[]
  allIds: string[]
} {
  const functional = prd.requirements
    .filter(r => r.type === 'functional')
    .map(r => r.id)
    .sort()

  const nonFunctional = prd.requirements
    .filter(r => r.type === 'non-functional')
    .map(r => r.id)
    .sort()

  const allIds = [...functional, ...nonFunctional].sort()

  return { functional, nonFunctional, allIds }
}

/**
 * Get next available requirement ID
 * @param prd ParsedPrd object
 * @param type Type of requirement ('functional' | 'non-functional')
 * @returns Next available requirement ID
 */
export function getNextRequirementId(
  prd: ParsedPrd,
  type: 'functional' | 'non-functional'
): string {
  const existingIds = extractRequirementIds(prd)
  const relevantIds = type === 'functional' ? existingIds.functional : existingIds.nonFunctional
  const prefix = type === 'functional' ? 'REQ-F-' : 'REQ-NF-'

  // Find highest number
  let highestNum = 0
  for (const id of relevantIds) {
    const match = id.match(type === 'functional' ? /REQ-F-(\d{3})/ : /REQ-NF-(\d{3})/)
    if (match && match[1]) {
      const num = parseInt(match[1], 10)
      if (num > highestNum) {
        highestNum = num
      }
    }
  }

  const nextNum = highestNum + 1
  return `${prefix}${String(nextNum).padStart(3, '0')}`
}

/**
 * Parse and validate PRD file
 * @param prdFile Path to PRD file
 * @returns ParsedPrd object
 */
export async function parsePrdFile(prdFile: string): Promise<ParsedPrd> {
  // Validate file path
  if (!prdFile) {
    throw new Error('PRD file path is required')
  }

  // Check if PRD file exists
  try {
    await access(prdFile)
  } catch (error) {
    throw new Error(`PRD file not found: ${prdFile}`)
  }

  // Read and parse file content
  try {
    const content = await readFile(prdFile, 'utf-8')
    return parsePrdContent(content)
  } catch (error) {
    throw new Error(
      `Cannot read PRD file: ${prdFile}. ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Extend an existing PRD file with new requirements
 * @param prdFile Path to the existing PRD file
 * @param requirementDescription Description of the new requirement to add
 */
export async function extendPRD(prdFile: string, requirementDescription: string): Promise<void> {
  // Validate inputs
  if (!prdFile) {
    throw new Error('PRD file path is required')
  }

  if (!requirementDescription) {
    throw new Error('Requirement description is required')
  }

  // Parse and validate existing PRD
  const parsedPrd = await parsePrdFile(prdFile)

  if (!parsedPrd.isValid) {
    throw new Error(`Invalid PRD file structure:\n${parsedPrd.errors.join('\n')}`)
  }

  console.log(`Extending PRD: ${prdFile}`)
  console.log(`PRD Title: ${parsedPrd.title}`)
  console.log(`Found ${parsedPrd.requirements.length} existing requirements`)
  console.log(`Found ${parsedPrd.sections.size} sections`)
  console.log(`New requirement: ${requirementDescription}`)

  // TODO: Implement the actual extend-prd functionality in subsequent tasks
  // For now, we've successfully parsed and validated the PRD
  throw new Error(
    'extend-prd functionality not yet implemented - this will be implemented in subsequent tasks'
  )
}
