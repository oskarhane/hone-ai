import { readFile, writeFile, access, rename, unlink } from 'fs/promises'
import yaml from 'js-yaml'
import { loadConfig, resolveModelForPhase } from './config'
import { AgentClient } from './agent-client'
import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
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

// Atomic File Operation Types
export interface AtomicFileOperation {
  targetPath: string
  tempPath: string
  content: string
  originalExists: boolean
}

/**
 * Create a temporary file path for atomic operations
 * @param filePath Original file path
 * @returns Temporary file path with unique identifier
 */
function createTempFilePath(filePath: string): string {
  const dir = dirname(filePath)
  const base = basename(filePath)
  const uuid = randomUUID().substring(0, 8) // Use shorter UUID for temp files
  return join(dir, `.${base}.tmp.${uuid}`)
}

/**
 * Prepare atomic file operation by writing content to temporary file
 * @param filePath Target file path
 * @param content Content to write
 * @returns AtomicFileOperation object for committing or rolling back
 */
export async function prepareAtomicWrite(
  filePath: string,
  content: string
): Promise<AtomicFileOperation> {
  const tempPath = createTempFilePath(filePath)
  const originalExists = existsSync(filePath)

  try {
    // Write content to temporary file
    await writeFile(tempPath, content, 'utf-8')

    return {
      targetPath: filePath,
      tempPath,
      content,
      originalExists,
    }
  } catch (error) {
    // Clean up temp file if it was created
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath)
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

/**
 * Commit atomic file operation by moving temp file to target location
 * @param operation AtomicFileOperation to commit
 */
export async function commitAtomicWrite(operation: AtomicFileOperation): Promise<void> {
  try {
    // Atomic move: rename temp file to target file
    await rename(operation.tempPath, operation.targetPath)
  } catch (error) {
    // Clean up temp file on failure
    try {
      await unlink(operation.tempPath)
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

/**
 * Rollback atomic file operation by removing temp file
 * @param operation AtomicFileOperation to rollback
 */
export async function rollbackAtomicWrite(operation: AtomicFileOperation): Promise<void> {
  try {
    if (existsSync(operation.tempPath)) {
      await unlink(operation.tempPath)
    }
  } catch {
    // Ignore rollback errors - temp file cleanup is best effort
  }
}

/**
 * Multi-file atomic transaction manager
 */
export class AtomicTransaction {
  private operations: AtomicFileOperation[] = []

  /**
   * Add a file write operation to the transaction
   * @param filePath Target file path
   * @param content Content to write
   */
  async prepareWrite(filePath: string, content: string): Promise<void> {
    const operation = await prepareAtomicWrite(filePath, content)
    this.operations.push(operation)
  }

  /**
   * Commit all prepared operations atomically
   */
  async commit(): Promise<void> {
    const committed: AtomicFileOperation[] = []

    try {
      // Commit all operations
      for (const operation of this.operations) {
        await commitAtomicWrite(operation)
        committed.push(operation)
      }
    } catch (error) {
      // Rollback any operations that were successfully committed
      console.error('Error during atomic transaction commit, rolling back...')
      for (const operation of committed) {
        try {
          // For committed operations, we can't easily rollback the rename,
          // but we can clean up any remaining temp files
          await rollbackAtomicWrite(operation)
        } catch {
          // Ignore rollback errors during error recovery
        }
      }

      // Rollback any remaining operations
      await this.rollback()
      throw error
    }

    // Clear operations after successful commit
    this.operations = []
  }

  /**
   * Rollback all prepared operations
   */
  async rollback(): Promise<void> {
    for (const operation of this.operations) {
      await rollbackAtomicWrite(operation)
    }
    this.operations = []
  }

  /**
   * Get number of pending operations
   */
  get pendingCount(): number {
    return this.operations.length
  }
}

/**
 * Perform atomic file write operation (convenience function)
 * @param filePath Target file path
 * @param content Content to write
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const operation = await prepareAtomicWrite(filePath, content)
  await commitAtomicWrite(operation)
}

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
 * Generate new requirements content using AI
 * @param requirementDescription Initial requirement description
 * @param qa Q&A responses for refinement
 * @param prdContext Parsed PRD for context
 * @param config Configuration object
 * @param model Model to use for generation
 * @param contentContext Content fetched from files and URLs
 * @returns Object with functional and non-functional requirements
 */
async function generateNewRequirementsContent(
  requirementDescription: string,
  qa: Array<{ question: string; answer: string }>,
  prdContext: ParsedPrd,
  config: any,
  model: string,
  contentContext: ContentContext
): Promise<{ functional: string[]; nonFunctional: string[] }> {
  const client = new AgentClient({
    agent: config.defaultAgent,
    model,
  })

  console.log('Generating refined requirements content...')

  const qaHistory = qa.map(item => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n')

  // Format existing requirements for context
  const existingRequirements = prdContext.requirements
    .map(req => `${req.id}: ${req.description}`)
    .join('\n')

  // Format content context
  let contentSection = ''
  if (contentContext.successful.length > 0) {
    const successfulContent = contentContext.successful
      .map(ref => {
        const preview =
          ref.content!.length > 1000
            ? ref.content!.substring(0, 1000) + '...(truncated)'
            : ref.content!
        return `${ref.type.toUpperCase()}: ${ref.reference}\nContent:\n${preview}\n`
      })
      .join('\n')

    contentSection = `\nReferenced Content:\n${successfulContent}\n`
  }

  const systemPrompt = `You are generating specific requirement statements for a Product Requirements Document (PRD).

Based on the initial requirement description, Q&A refinement session, and existing PRD context, generate concise, actionable requirements that can be added to the PRD.

IMPORTANT FORMATTING RULES:
- Generate requirements as bullet points without REQ-ID prefixes (IDs will be added automatically)
- Use clear, specific language that describes what the system must do
- Keep each requirement to 1-2 sentences maximum
- Focus on the NEW requirement being added, not existing requirements
- Separate functional requirements (what the system does) from non-functional requirements (how well it does it)
- Make requirements testable and measurable where possible

PRD Context:
- Title: ${prdContext.title}
- Existing Requirements:
${existingRequirements}

New Requirement Details:
- Initial Description: ${requirementDescription}
${contentSection}${qaHistory ? `\nRefinement Q&A:\n${qaHistory}` : ''}

Generate requirements in this exact format:

FUNCTIONAL REQUIREMENTS:
- [First functional requirement]
- [Second functional requirement]
- [Additional functional requirements as needed]

NON-FUNCTIONAL REQUIREMENTS:
- [First non-functional requirement]
- [Second non-functional requirement]
- [Additional non-functional requirements as needed]

If no non-functional requirements are needed, write "NON-FUNCTIONAL REQUIREMENTS:\n- None identified"`

  try {
    const response = await client.messages.create({
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: 'Generate the requirements now following the exact format specified.',
        },
      ],
      system: systemPrompt,
    })

    const content = response.content[0]
    const text = content && content.type === 'text' ? content.text.trim() : ''

    if (!text) {
      throw new Error('AI returned empty requirements content')
    }

    // Parse AI response into functional and non-functional requirements
    // Expected format: sections marked by "FUNCTIONAL REQUIREMENTS:" and "NON-FUNCTIONAL REQUIREMENTS:"
    // followed by bullet points (lines starting with "-")
    const functional: string[] = []
    const nonFunctional: string[] = []

    const lines = text.split('\n')
    let currentSection: 'functional' | 'non-functional' | null = null

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.toUpperCase().includes('FUNCTIONAL REQUIREMENTS:')) {
        currentSection = 'functional'
        continue
      }

      if (trimmed.toUpperCase().includes('NON-FUNCTIONAL REQUIREMENTS:')) {
        currentSection = 'non-functional'
        continue
      }

      // Skip empty lines and non-bullet points
      if (!trimmed || !trimmed.startsWith('-')) {
        continue
      }

      const requirement = trimmed.substring(1).trim()
      if (requirement && requirement !== 'None identified') {
        if (currentSection === 'functional') {
          functional.push(requirement)
        } else if (currentSection === 'non-functional') {
          nonFunctional.push(requirement)
        }
      }
    }

    console.log(
      `Generated ${functional.length} functional and ${nonFunctional.length} non-functional requirements`
    )

    return { functional, nonFunctional }
  } catch (error) {
    throw new Error(
      `Failed to generate requirements content: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Format requirement with proper ID and formatting
 * @param requirement Requirement text
 * @param id Requirement ID (e.g., REQ-F-001)
 * @returns Formatted requirement string
 */
export function formatRequirement(requirement: string, id: string): string {
  return `- ${id}: ${requirement}`
}

/**
 * Insert new requirements into PRD section content
 * @param sectionContent Current section content
 * @param newRequirements Array of formatted requirements to insert
 * @param subsectionTitle Subsection to insert into (e.g., "Functional Requirements")
 * @returns Updated section content
 */
export function insertRequirementsIntoSection(
  sectionContent: string,
  newRequirements: string[],
  subsectionTitle: string
): string {
  if (newRequirements.length === 0) {
    return sectionContent
  }

  const lines = sectionContent.split('\n')
  const subsectionHeader = `### ${subsectionTitle}`
  let insertIndex = -1
  let foundSubsection = false

  // Find the subsection and determine where to insert
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === subsectionHeader) {
      foundSubsection = true
      // Look for the end of this subsection (next ### or end of section)
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]?.trim() || ''

        // If we hit another subsection or section, insert before it
        if (line.startsWith('###') || line.startsWith('##')) {
          insertIndex = j
          break
        }

        // If we reach the end, insert at the end
        if (j === lines.length - 1) {
          insertIndex = lines.length
          break
        }
      }
      break
    }
  }

  if (!foundSubsection) {
    // If subsection doesn't exist, we'll need to create it
    // This shouldn't happen with valid PRDs, but handle gracefully
    throw new Error(`Subsection "${subsectionTitle}" not found in Requirements section`)
  }

  if (insertIndex === -1) {
    insertIndex = lines.length
  }

  // Insert the new requirements
  const newLines = [...lines]
  newLines.splice(insertIndex, 0, ...newRequirements, '')

  return newLines.join('\n')
}

/**
 * Append new requirements to PRD file
 * @param prdFilePath Path to PRD file
 * @param parsedPrd Parsed PRD structure
 * @param requirementDescription Original requirement description
 * @param qa Q&A responses
 * @param config Configuration object
 * @param model Model to use
 * @param contentContext Fetched content context
 * @returns Updated PRD content
 */
async function appendRequirementsToPrd(
  prdFilePath: string,
  parsedPrd: ParsedPrd,
  requirementDescription: string,
  qa: Array<{ question: string; answer: string }>,
  config: any,
  model: string,
  contentContext: ContentContext
): Promise<string> {
  // Generate new requirements using AI
  const { functional, nonFunctional } = await generateNewRequirementsContent(
    requirementDescription,
    qa,
    parsedPrd,
    config,
    model,
    contentContext
  )

  // Read the original PRD file content
  const originalContent = await readFile(prdFilePath, 'utf-8')
  const lines = originalContent.split('\n')

  // Get the Requirements section
  const requirementsSection = parsedPrd.sections.get('Requirements')
  if (!requirementsSection) {
    throw new Error('Requirements section not found in PRD')
  }

  // Generate requirement IDs and format requirements
  const formattedFunctional: string[] = []
  for (let i = 0; i < functional.length; i++) {
    const reqId = getNextRequirementId(parsedPrd, 'functional')
    formattedFunctional.push(formatRequirement(functional[i]!, reqId))

    // Update parsedPrd to reflect the new requirement for next ID calculation
    parsedPrd.requirements.push({
      id: reqId,
      description: functional[i]!,
      type: 'functional',
      lineNumber: -1, // Indicates newly added requirement not yet persisted to file
    })
  }

  const formattedNonFunctional: string[] = []
  for (let i = 0; i < nonFunctional.length; i++) {
    const reqId = getNextRequirementId(parsedPrd, 'non-functional')
    formattedNonFunctional.push(formatRequirement(nonFunctional[i]!, reqId))

    // Update parsedPrd to reflect the new requirement for next ID calculation
    parsedPrd.requirements.push({
      id: reqId,
      description: nonFunctional[i]!,
      type: 'non-functional',
      lineNumber: -1, // Indicates newly added requirement not yet persisted to file
    })
  }

  // Update the Requirements section content
  let updatedRequirementsContent = requirementsSection.content

  // Insert functional requirements
  if (formattedFunctional.length > 0) {
    updatedRequirementsContent = insertRequirementsIntoSection(
      updatedRequirementsContent,
      formattedFunctional,
      'Functional Requirements'
    )
  }

  // Insert non-functional requirements
  if (formattedNonFunctional.length > 0) {
    updatedRequirementsContent = insertRequirementsIntoSection(
      updatedRequirementsContent,
      formattedNonFunctional,
      'Non-Functional Requirements'
    )
  }

  // Reconstruct the full PRD content with updated Requirements section
  const newLines = [...lines]
  const startLine = requirementsSection.startLine - 1 // Convert to 0-based index
  const endLine = requirementsSection.endLine - 1

  // Replace the Requirements section
  const requirementsSectionLines = updatedRequirementsContent.split('\n')
  // Add the section header back
  requirementsSectionLines.unshift('## Requirements')

  newLines.splice(startLine, endLine - startLine + 1, ...requirementsSectionLines)

  const updatedContent = newLines.join('\n')

  // Write the updated content back to the file atomically
  await atomicWriteFile(prdFilePath, updatedContent)

  return updatedContent
}

/**
 * Find existing task file that corresponds to PRD file
 * @param prdFilePath Path to PRD file
 * @returns Path to task file or null if not found
 */
function findExistingTaskFile(prdFilePath: string): string | null {
  const prdBasename = prdFilePath.split('/').pop() || ''
  const featureMatch = prdBasename.match(/^prd-(.+)\.md$/)

  if (!featureMatch || !featureMatch[1]) {
    return null
  }

  const featureName = featureMatch[1]
  const taskFilePath = join(process.cwd(), '.plans', `tasks-${featureName}.yml`)

  return existsSync(taskFilePath) ? taskFilePath : null
}

/**
 * Generate new requirements from parsed PRD based on recently added requirements
 * @param parsedPrd ParsedPrd object containing all requirements
 * @returns Array of new requirements that were just added
 */
function getNewRequirements(parsedPrd: ParsedPrd): PrdRequirement[] {
  // New requirements are those added to parsedPrd during the append process
  // They have lineNumber: -1 to indicate they haven't been persisted to file yet
  return parsedPrd.requirements.filter(req => req.lineNumber === -1)
}

/**
 * Generate tasks for new requirements using AI
 * @param newRequirements Array of new requirements to generate tasks for
 * @param existingTaskFile Parsed existing task file
 * @param prdContext ParsedPrd for context
 * @param config Configuration object
 * @param model Model to use for generation
 * @returns Array of new Task objects
 */
async function generateTasksForNewRequirements(
  newRequirements: PrdRequirement[],
  existingTaskFile: ParsedTaskFile,
  prdContext: ParsedPrd,
  config: any,
  model: string
): Promise<Task[]> {
  const client = new AgentClient({
    agent: config.defaultAgent,
    model,
  })

  console.log(`Generating tasks for ${newRequirements.length} new requirements...`)

  // Format new requirements for AI
  const newReqsText = newRequirements.map(req => `${req.id}: ${req.description}`).join('\n')

  // Format existing tasks for context
  const existingTasksText = existingTaskFile.taskFile.tasks
    .map(task => `${task.id}: ${task.title}`)
    .join('\n')

  // Format all requirements for broader context
  const allRequirementsText = prdContext.requirements
    .map(req => `${req.id}: ${req.description}`)
    .join('\n')

  const systemPrompt = `You are generating implementation tasks for NEW requirements that have been added to an existing PRD.

IMPORTANT: You should ONLY generate tasks for the new requirements listed below. DO NOT generate tasks for existing requirements or duplicate existing functionality.

Generate an ordered list of tasks following these guidelines:

1. **Task Structure**: Each task must have:
   - id: Unique identifier starting from ${getNextTaskId(existingTaskFile)} (task-XXX format)
   - title: Brief, actionable title (max 80 chars)
   - description: Detailed description of what needs to be done (2-4 sentences)
   - status: Always "pending" for new tasks
   - dependencies: Array of task IDs that must complete first (can reference existing tasks)
   - acceptance_criteria: Array of specific, testable criteria (3-5 items)
   - completed_at: Always null for new tasks

2. **Task Dependencies**:
   - New tasks can depend on existing completed tasks
   - New tasks can depend on other new tasks
   - Identify which tasks must complete before others
   - Use task IDs in dependencies array

3. **Integration with Existing Tasks**:
   - Consider how new tasks relate to existing completed work
   - Build upon existing infrastructure where possible
   - Don't duplicate functionality that already exists

4. **Output Format**: Return ONLY a JSON array of NEW tasks, no other text.

PRD Context:
- Title: ${prdContext.title}
- All Requirements:
${allRequirementsText}

Existing Tasks (for dependency reference):
${existingTasksText}

NEW Requirements to implement:
${newReqsText}

Generate tasks only for the NEW requirements listed above.`

  try {
    const response = await client.messages.create({
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: 'Generate tasks for the new requirements following the format specified.',
        },
      ],
      system: systemPrompt,
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new Error('Invalid response from AI')
    }

    // Extract JSON from response
    let jsonText = content.text.trim()
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      jsonText = jsonMatch[1]
    }

    try {
      const tasks = JSON.parse(jsonText)

      if (!Array.isArray(tasks)) {
        throw new Error('Response is not an array')
      }

      // Validate and adjust task structure
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        if (
          !task.id ||
          !task.title ||
          !task.description ||
          !task.status ||
          !Array.isArray(task.dependencies) ||
          !Array.isArray(task.acceptance_criteria)
        ) {
          throw new Error(`Invalid task structure: ${JSON.stringify(task)}`)
        }

        // Ensure task ID is correct - adjust all tasks sequentially
        const expectedId = `task-${String(existingTaskFile.highestTaskId + 1 + i).padStart(3, '0')}`
        if (task.id !== expectedId) {
          console.log(`Adjusting task ID from ${task.id} to ${expectedId}`)
          task.id = expectedId
        }
      }

      // Update the highest task ID counter after all tasks are processed
      existingTaskFile.highestTaskId += tasks.length

      return tasks
    } catch (error) {
      throw new Error(
        `Failed to parse AI response as JSON: ${error instanceof Error ? error.message : error}`
      )
    }
  } catch (error) {
    throw new Error(
      `Failed to generate tasks for new requirements: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Update task file metadata when new tasks are added
 * @param originalTaskFile Original task file data
 * @param newTasks Array of new tasks being added
 * @returns TaskFile with updated metadata
 */
export function updateTaskFileMetadata(originalTaskFile: TaskFile, newTasks: Task[]): TaskFile {
  const now = new Date().toISOString()

  // Preserve all existing fields while updating metadata
  const updatedTaskFile: TaskFile = {
    // Preserve original fields in their original order
    feature: originalTaskFile.feature,
    ...(originalTaskFile.prd && { prd: originalTaskFile.prd }), // Only include prd if it exists in original
    created_at: originalTaskFile.created_at, // Preserve original creation time
    updated_at: now, // Update modification time

    // Merge tasks arrays
    tasks: [...originalTaskFile.tasks, ...newTasks],
  }

  return updatedTaskFile
}

/**
 * Generate incremental tasks for new requirements and update task file
 * @param taskFilePath Path to existing task file
 * @param prdFilePath Path to PRD file (for reference)
 * @param parsedPrd ParsedPrd object with new requirements
 * @param config Configuration object
 * @param model Model to use for task generation
 */
async function generateIncrementalTasks(
  taskFilePath: string,
  prdFilePath: string,
  parsedPrd: ParsedPrd,
  config: any,
  model: string
): Promise<void> {
  // Parse existing task file
  const existingTaskFile = await parseTaskFile(taskFilePath)

  if (!existingTaskFile.isValid) {
    throw new Error(`Invalid task file structure:\n${existingTaskFile.errors.join('\n')}`)
  }

  // Get the original requirement count (before any new requirements were added)
  const originalRequirementCount = parsedPrd.requirements.filter(
    req => req.lineNumber !== -1
  ).length

  // Get new requirements that were just added
  const newRequirements = getNewRequirements(parsedPrd)

  if (newRequirements.length === 0) {
    console.log('No new requirements found. Skipping task generation.')
    return
  }

  console.log(`Found ${newRequirements.length} new requirements:`)
  newRequirements.forEach(req => {
    console.log(`  ${req.id}: ${req.description}`)
  })

  // Generate tasks for new requirements
  const newTasks = await generateTasksForNewRequirements(
    newRequirements,
    existingTaskFile,
    parsedPrd,
    config,
    model
  )

  if (newTasks.length === 0) {
    console.log('No new tasks generated.')
    return
  }

  console.log(`Generated ${newTasks.length} new tasks:`)
  newTasks.forEach(task => {
    console.log(`  ${task.id}: ${task.title}`)
  })

  // Update task file with comprehensive metadata updates
  const updatedTaskFile = updateTaskFileMetadata(existingTaskFile.taskFile, newTasks)

  // Validate metadata accuracy
  const originalTaskCount = existingTaskFile.taskFile.tasks.length
  const newTaskCount = updatedTaskFile.tasks.length
  const expectedTaskCount = originalTaskCount + newTasks.length

  if (newTaskCount !== expectedTaskCount) {
    throw new Error(
      `Task count mismatch: expected ${expectedTaskCount}, got ${newTaskCount}. ` +
        `Original: ${originalTaskCount}, New: ${newTasks.length}`
    )
  }

  // Validate that all original metadata is preserved
  if (updatedTaskFile.feature !== existingTaskFile.taskFile.feature) {
    throw new Error('Feature metadata was not preserved during update')
  }

  if (updatedTaskFile.created_at !== existingTaskFile.taskFile.created_at) {
    throw new Error('Created timestamp metadata was not preserved during update')
  }

  // Only validate prd field if it existed in original
  if (existingTaskFile.taskFile.prd && updatedTaskFile.prd !== existingTaskFile.taskFile.prd) {
    throw new Error('PRD path metadata was not preserved during update')
  }

  // Convert to YAML and write to file atomically
  const yamlContent = formatTaskFileAsYAML(updatedTaskFile)
  await atomicWriteFile(taskFilePath, yamlContent)

  console.log(`✓ Updated task file: ${taskFilePath}`)
  console.log(`✓ Added ${newTasks.length} new tasks to existing ${originalTaskCount} tasks`)
  console.log(`✓ Total tasks: ${newTaskCount}`)
  console.log(`✓ Metadata updated at: ${updatedTaskFile.updated_at}`)
}

/**
 * Format task file as YAML string (similar to task-generator.ts formatAsYAML)
 * @param taskFile TaskFile object to format
 * @returns YAML string
 */
function formatTaskFileAsYAML(taskFile: TaskFile): string {
  const lines: string[] = []

  lines.push(`feature: ${taskFile.feature}`)
  if (taskFile.prd) {
    lines.push(`prd: ${taskFile.prd}`)
  }
  lines.push(`created_at: ${taskFile.created_at}`)
  lines.push(`updated_at: ${taskFile.updated_at}`)
  lines.push('')
  lines.push('tasks:')

  for (const task of taskFile.tasks) {
    lines.push(`  - id: ${task.id}`)
    lines.push(`    title: "${task.title}"`)

    // Multi-line description with proper YAML indentation
    lines.push(`    description: |`)
    const descLines = task.description.split('\n')
    for (const line of descLines) {
      lines.push(`      ${line}`)
    }

    lines.push(`    status: ${task.status}`)

    // Dependencies
    if (!task.dependencies || task.dependencies.length === 0) {
      lines.push(`    dependencies: []`)
    } else {
      lines.push(`    dependencies:`)
      for (const dep of task.dependencies) {
        lines.push(`      - ${dep}`)
      }
    }

    // Acceptance criteria
    lines.push(`    acceptance_criteria:`)
    if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
      for (const criterion of task.acceptance_criteria) {
        lines.push(`      - "${criterion}"`)
      }
    }

    lines.push(`    completed_at: ${task.completed_at || 'null'}`)
    lines.push('')
  }

  return lines.join('\n')
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

  try {
    // Generate and append new requirements to PRD
    await appendRequirementsToPrd(
      prdFile,
      parsedPrd,
      requirementDescription,
      qa,
      config,
      model,
      contentContext
    )

    console.log('PRD content updated successfully!')
    console.log(`Updated PRD written to: ${prdFile}`)

    // Generate tasks for new requirements if task file exists
    const taskFilePath = findExistingTaskFile(prdFile)
    if (taskFilePath) {
      console.log(`Found existing task file: ${taskFilePath}`)
      await generateIncrementalTasks(taskFilePath, prdFile, parsedPrd, config, model)
    } else {
      console.log('No existing task file found. Skipping task generation.')
    }

    console.log('\nExtend-PRD operation completed successfully!')
  } catch (error) {
    console.error('Error during extend-PRD operation:', error)
    throw error
  }
}
