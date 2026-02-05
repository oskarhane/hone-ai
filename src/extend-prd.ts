import { readFile, access } from 'fs/promises'
import yaml from 'js-yaml'
import { loadConfig, resolveModelForPhase } from './config'
import { AgentClient } from './agent-client'
import { join } from 'path'
import { existsSync } from 'fs'
import * as readline from 'readline'

// Task File Types
export interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  dependencies?: string[]
  acceptance_criteria?: string[]
  completed_at?: string | null
}

export interface TaskFile {
  feature: string
  prd?: string
  created_at: string | Date
  updated_at: string | Date
  tasks: Task[]
}

export interface ParsedTaskFile {
  taskFile: TaskFile
  taskIds: string[]
  highestTaskId: number
  isValid: boolean
  errors: string[]
}

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
 * Parse task YAML file content and extract task IDs
 * @param content Task file YAML content as string
 * @returns ParsedTaskFile object with tasks, IDs, and validation results
 */
export function parseTaskFileContent(content: string): ParsedTaskFile {
  const errors: string[] = []
  let isValid = true

  try {
    const taskFile = yaml.load(content) as TaskFile

    // Basic validation
    if (!taskFile || typeof taskFile !== 'object') {
      errors.push('Invalid task file structure')
      isValid = false
      return {
        taskFile: { feature: '', created_at: '', updated_at: '', tasks: [] },
        taskIds: [],
        highestTaskId: 0,
        isValid,
        errors,
      }
    }

    // Validate required fields

    if (!taskFile.feature || typeof taskFile.feature !== 'string') {
      errors.push('Missing or invalid "feature" field')
      isValid = false
    }

    if (
      !taskFile.created_at ||
      (typeof taskFile.created_at !== 'string' && !(taskFile.created_at instanceof Date))
    ) {
      errors.push('Missing or invalid "created_at" field')
      isValid = false
    }

    if (
      !taskFile.updated_at ||
      (typeof taskFile.updated_at !== 'string' && !(taskFile.updated_at instanceof Date))
    ) {
      errors.push('Missing or invalid "updated_at" field')
      isValid = false
    }

    if (!Array.isArray(taskFile.tasks)) {
      errors.push('Missing or invalid "tasks" field - must be an array')
      isValid = false
      taskFile.tasks = []
    }

    // Extract task IDs and find highest ID number
    const taskIds: string[] = []
    let highestTaskId = 0

    for (const task of taskFile.tasks || []) {
      if (!task || typeof task !== 'object') {
        errors.push('Invalid task object found')
        isValid = false
        continue
      }

      if (!task.id || typeof task.id !== 'string') {
        errors.push(`Task missing required "id" field: ${JSON.stringify(task)}`)
        isValid = false
        continue
      }

      taskIds.push(task.id)

      // Extract numeric part of task ID (e.g., "task-001" -> 1)
      const idMatch = task.id.match(/^task-(\d{3})$/)
      if (idMatch && idMatch[1]) {
        const idNumber = parseInt(idMatch[1], 10)
        if (idNumber > highestTaskId) {
          highestTaskId = idNumber
        }
      } else {
        errors.push(`Task ID "${task.id}" does not follow expected format "task-XXX"`)
        // Don't mark as invalid since this might be an acceptable variation
      }

      // Validate other required task fields
      if (!task.title || typeof task.title !== 'string') {
        errors.push(`Task "${task.id}" missing required "title" field`)
        isValid = false
      }

      if (!task.description || typeof task.description !== 'string') {
        errors.push(`Task "${task.id}" missing required "description" field`)
        isValid = false
      }

      if (!task.status || typeof task.status !== 'string') {
        errors.push(`Task "${task.id}" missing required "status" field`)
        isValid = false
      } else {
        const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled']
        if (!validStatuses.includes(task.status)) {
          errors.push(`Task "${task.id}" has invalid status: "${task.status}"`)
          isValid = false
        }
      }
    }

    // Check for duplicate task IDs
    const uniqueTaskIds = new Set(taskIds)
    if (uniqueTaskIds.size !== taskIds.length) {
      errors.push('Duplicate task IDs found')
      isValid = false
    }

    return {
      taskFile,
      taskIds,
      highestTaskId,
      isValid,
      errors,
    }
  } catch (error) {
    errors.push(`YAML parsing error: ${error instanceof Error ? error.message : String(error)}`)
    return {
      taskFile: { feature: '', created_at: '', updated_at: '', tasks: [] },
      taskIds: [],
      highestTaskId: 0,
      isValid: false,
      errors,
    }
  }
}

/**
 * Parse and validate task YAML file
 * @param taskFilePath Path to task YAML file
 * @returns ParsedTaskFile object
 */
export async function parseTaskFile(taskFilePath: string): Promise<ParsedTaskFile> {
  // Validate file path
  if (!taskFilePath) {
    throw new Error('Task file path is required')
  }

  // Check if task file exists
  try {
    await access(taskFilePath)
  } catch (error) {
    throw new Error(`Task file not found: ${taskFilePath}`)
  }

  // Read and parse file content
  try {
    const content = await readFile(taskFilePath, 'utf-8')
    return parseTaskFileContent(content)
  } catch (error) {
    throw new Error(
      `Cannot read task file: ${taskFilePath}. ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Generate next available task ID based on existing task IDs
 * @param parsedTaskFile ParsedTaskFile object containing existing tasks
 * @returns Next available task ID in format "task-XXX"
 */
export function getNextTaskId(parsedTaskFile: ParsedTaskFile): string {
  const nextNumber = parsedTaskFile.highestTaskId + 1
  return `task-${String(nextNumber).padStart(3, '0')}`
}

/**
 * Extract task IDs from parsed task file
 * @param parsedTaskFile ParsedTaskFile object
 * @returns Array of task IDs sorted alphabetically
 */
export function extractTaskIds(parsedTaskFile: ParsedTaskFile): string[] {
  return [...parsedTaskFile.taskIds].sort()
}

/**
 * Check if a task ID already exists in the task file
 * @param parsedTaskFile ParsedTaskFile object
 * @param taskId Task ID to check
 * @returns boolean indicating if task ID exists
 */
export function taskIdExists(parsedTaskFile: ParsedTaskFile, taskId: string): boolean {
  return parsedTaskFile.taskIds.includes(taskId)
}

// Interactive Q&A types and functions
interface QAResponse {
  question: string | null
  shouldContinue: boolean
}

// Content fetching types
export interface ContentReference {
  type: 'file' | 'url'
  reference: string
  content: string | null
  error: string | null
}

export interface ContentContext {
  references: ContentReference[]
  successful: ContentReference[]
  failed: ContentReference[]
}

/**
 * Extract content references (file paths and URLs) from text
 * @param text Text to analyze
 * @returns Array of content references with type and reference
 */
export function detectContentReferences(
  text: string
): Array<{ type: 'file' | 'url'; reference: string }> {
  const references: Array<{ type: 'file' | 'url'; reference: string }> = []

  // Extract URLs first
  const urlPattern = /https?:\/\/[^\s\)]+/gi
  const urlMatches = text.match(urlPattern) || []
  let remainingText = text

  for (const url of urlMatches) {
    // Clean trailing punctuation
    const cleanUrl = url.replace(/[.,;!?\)]+$/, '')
    references.push({ type: 'url', reference: cleanUrl })
    remainingText = remainingText.replace(url, ' ')
  }

  // File path detection - use a comprehensive regex and filter matches
  const fileMatches: string[] = []

  // Combined regex to capture file paths with extensions in order
  const pathRegex =
    /(\.\.?\/[\w/-]+\.\w+|~\/[\w/-]+\.\w+|(?<![.\w])\/[\w/-]+\.\w+|\b[\w-]+(?:\/[\w.-]+)+\.\w+)/g

  let match
  const seenFiles = new Set<string>()

  while ((match = pathRegex.exec(remainingText)) !== null) {
    const rawPath = match[0]
    const cleanPath = rawPath.replace(/[.,;!?\)]+$/, '')

    if (cleanPath.length >= 3 && !cleanPath.includes('://') && !seenFiles.has(cleanPath)) {
      // Additional validation to avoid spurious matches
      if (cleanPath.includes('.') && (cleanPath.includes('/') || cleanPath.startsWith('.'))) {
        seenFiles.add(cleanPath)
        fileMatches.push(cleanPath)
      }
    }
  }

  // Add file matches
  for (const filePath of fileMatches) {
    references.push({ type: 'file', reference: filePath })
  }

  // Remove duplicates
  const seen = new Set<string>()
  return references.filter(ref => {
    const key = `${ref.type}:${ref.reference}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Fetch content from a URL
 * @param url URL to fetch content from
 * @returns Content string or null if failed
 */
async function fetchUrlContent(
  url: string
): Promise<{ content: string | null; error: string | null }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'hone-ai/0.15.0 (Content Fetcher)',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        content: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const content = await response.text()
    return { content, error: null }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { content: null, error: 'Request timeout (10 seconds)' }
      }
      return { content: null, error: error.message }
    }
    return { content: null, error: 'Unknown network error' }
  }
}

/**
 * Fetch content from a local file
 * @param filePath Path to the file
 * @returns Content string or null if failed
 */
async function fetchFileContent(
  filePath: string
): Promise<{ content: string | null; error: string | null }> {
  try {
    // Handle relative paths and home directory
    let resolvedPath = filePath
    if (filePath.startsWith('~')) {
      resolvedPath = filePath.replace(/^~/, process.env.HOME || '')
    } else if (!filePath.startsWith('/')) {
      resolvedPath = join(process.cwd(), filePath)
    }

    // Check file exists and is accessible
    await access(resolvedPath)

    const content = await readFile(resolvedPath, 'utf-8')
    return { content, error: null }
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as any
      if (nodeError.code === 'ENOENT') {
        return { content: null, error: 'File not found' }
      }
      if (nodeError.code === 'EACCES') {
        return { content: null, error: 'Permission denied' }
      }
      return { content: null, error: error.message }
    }
    return { content: null, error: 'Unknown file access error' }
  }
}

/**
 * Fetch content from detected file paths and URLs
 * @param requirementDescription Text to search for content references
 * @returns ContentContext with fetched content and errors
 */
export async function fetchContentReferences(
  requirementDescription: string
): Promise<ContentContext> {
  const detectedRefs = detectContentReferences(requirementDescription)
  const references: ContentReference[] = []

  console.log(`Detected ${detectedRefs.length} content references to fetch...`)

  for (const ref of detectedRefs) {
    console.log(`Fetching ${ref.type}: ${ref.reference}`)

    let result: { content: string | null; error: string | null }

    if (ref.type === 'url') {
      result = await fetchUrlContent(ref.reference)
    } else {
      result = await fetchFileContent(ref.reference)
    }

    const contentRef: ContentReference = {
      type: ref.type,
      reference: ref.reference,
      content: result.content,
      error: result.error,
    }

    references.push(contentRef)

    if (result.content) {
      console.log(
        `✓ Successfully fetched ${ref.type}: ${ref.reference} (${result.content.length} chars)`
      )
    } else {
      console.log(`✗ Failed to fetch ${ref.type}: ${ref.reference} - ${result.error}`)
    }
  }

  const successful = references.filter(r => r.content !== null)
  const failed = references.filter(r => r.content === null)

  console.log(
    `Content fetching complete: ${successful.length} successful, ${failed.length} failed\n`
  )

  return {
    references,
    successful,
    failed,
  }
}

/**
 * Ask user a question interactively via command line
 * @param prompt Question to ask the user
 * @returns User's response
 */
async function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * Generate clarifying question for new requirement using AI
 * @param requirementDescription Description of the new requirement
 * @param prdContext Parsed PRD context including existing requirements
 * @param previousQA Previous Q&A history
 * @param roundNumber Current question round
 * @param contentContext Content fetched from files and URLs
 * @returns QAResponse with question or indication to stop
 */
async function generateClarifyingQuestion(
  requirementDescription: string,
  prdContext: ParsedPrd,
  previousQA: Array<{ question: string; answer: string }>,
  roundNumber: number,
  config: any,
  model: string,
  contentContext: ContentContext
): Promise<QAResponse> {
  const client = new AgentClient({
    agent: config.defaultAgent,
    model,
  })

  // Show progress indicator
  process.stdout.write(`Generating question ${roundNumber}... `)

  const qaHistory = previousQA.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')

  // Read AGENTS.md for project context
  let agentsContent = ''
  const agentsPath = join(process.cwd(), 'AGENTS.md')
  if (existsSync(agentsPath)) {
    try {
      agentsContent = await readFile(agentsPath, 'utf-8')
    } catch {
      // Ignore errors reading AGENTS.md
    }
  }

  // Format existing requirements for context
  const existingRequirements = prdContext.requirements
    .map(req => `${req.id}: ${req.description}`)
    .join('\n')

  // Format fetched content context
  let contentSection = ''
  if (contentContext.references.length > 0) {
    const successfulContent = contentContext.successful
      .map(ref => {
        const preview =
          ref.content!.length > 500
            ? ref.content!.substring(0, 500) + '...(truncated)'
            : ref.content!
        return `${ref.type.toUpperCase()}: ${ref.reference}\nContent:\n${preview}\n`
      })
      .join('\n')

    const failedRefs =
      contentContext.failed.length > 0
        ? `\nFailed to access:\n${contentContext.failed.map(ref => `- ${ref.reference}: ${ref.error}`).join('\n')}`
        : ''

    contentSection = `\nReferenced Content:\n${successfulContent}${failedRefs}\n`
  }

  const systemPrompt = `You are helping extend a Product Requirements Document (PRD) with a new requirement.
The user has provided a new requirement description, and you need to ask clarifying questions to make it comprehensive and well-integrated with existing requirements.

IMPORTANT: Focus on clarifying the NEW requirement, not rewriting the entire PRD.

Rules:
- Ask ONE specific, focused question at a time
- Questions should help clarify the requirement's scope, implementation details, edge cases, or integration points
- Keep questions concise and actionable
- Consider how this requirement relates to existing requirements
- Use the content from referenced files and URLs to inform your questions
- If you have enough information to write a good requirement, respond with "DONE" instead of a question
- You are on round ${roundNumber} of maximum 5 rounds

PRD Title: ${prdContext.title}

Existing Requirements:
${existingRequirements}

${
  agentsContent
    ? `Project documentation (AGENTS.md):
${agentsContent}

`
    : ''
}New requirement description: ${requirementDescription}
${contentSection}
${qaHistory ? `Previous Q&A:\n${qaHistory}` : 'This is the first question.'}`

  try {
    const response = await client.messages.create({
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content:
            'What is your next clarifying question about this new requirement, or respond with "DONE" if you have enough information?',
        },
      ],
      system: systemPrompt,
    })

    const content = response.content[0]
    const text = content && content.type === 'text' ? content.text.trim() : ''

    // Clear progress indicator
    process.stdout.write('✓\n')

    if (text.toUpperCase().includes('DONE') || text === '') {
      return { question: null, shouldContinue: false }
    }

    return { question: text, shouldContinue: true }
  } catch (error) {
    // Clear progress indicator with error
    process.stdout.write('✗\n')
    throw error
  }
}

/**
 * Run interactive Q&A session to refine requirement description
 * @param requirementDescription Initial requirement description
 * @param prdContext Parsed PRD context
 * @param contentContext Content fetched from files and URLs
 * @returns Array of Q&A pairs
 */
export async function runRequirementRefinementQA(
  requirementDescription: string,
  prdContext: ParsedPrd,
  config: any,
  model: string,
  contentContext: ContentContext
): Promise<Array<{ question: string; answer: string }>> {
  const qa: Array<{ question: string; answer: string }> = []
  const maxRounds = 5

  console.log('I have a few questions to refine this requirement:\n')

  for (let round = 1; round <= maxRounds; round++) {
    try {
      const { question, shouldContinue } = await generateClarifyingQuestion(
        requirementDescription,
        prdContext,
        qa,
        round,
        config,
        model,
        contentContext
      )

      if (!shouldContinue || !question) {
        break
      }

      console.log(`${round}. ${question}`)
      const answer = await askQuestion('> ')

      if (answer.toLowerCase() === 'done') {
        break
      }

      qa.push({ question, answer })
      console.log('')
    } catch (error) {
      console.error(
        `\nError generating clarifying question for round ${round}: ${error instanceof Error ? error.message : String(error)}`
      )
      console.log('Continuing with available information...\n')
      break
    }
  }

  return qa
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

  // Load configuration and resolve model for extendPrd phase
  const config = await loadConfig()
  const model = resolveModelForPhase(config, 'extendPrd')

  console.log(`Using model: ${model} for PRD extension`)

  // Parse and validate existing PRD
  const parsedPrd = await parsePrdFile(prdFile)

  if (!parsedPrd.isValid) {
    throw new Error(`Invalid PRD file structure:\n${parsedPrd.errors.join('\n')}`)
  }

  console.log(`Extending PRD: ${prdFile}`)
  console.log(`PRD Title: ${parsedPrd.title}`)
  console.log(`Found ${parsedPrd.requirements.length} existing requirements`)
  console.log(`Found ${parsedPrd.sections.size} sections`)
  console.log(`New requirement: ${requirementDescription}\n`)

  // Fetch content from any referenced files or URLs
  const contentContext = await fetchContentReferences(requirementDescription)

  // Run interactive Q&A refinement session
  const qa = await runRequirementRefinementQA(
    requirementDescription,
    parsedPrd,
    config,
    model,
    contentContext
  )

  if (qa.length > 0) {
    console.log('\nRequirement refinement complete!')
    console.log('Q&A Summary:')
    qa.forEach((item, index) => {
      console.log(`${index + 1}. Q: ${item.question}`)
      console.log(`   A: ${item.answer}\n`)
    })
  } else {
    console.log('\nNo additional clarification needed.\n')
  }

  // ✓ Implemented file/URL content fetching in task-006
  // TODO: Implement PRD content appending in task-007
  // TODO: Implement task generation in task-008

  throw new Error(
    'extend-prd functionality partially implemented - remaining tasks: PRD appending, task generation'
  )
}
