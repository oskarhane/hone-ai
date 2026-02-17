/**
 * AGENTS.md generation functionality
 * Core module for generating project documentation for AI agents
 */

import {
  loadConfig,
  loadConfigWithoutCreation,
  resolveModelForPhase,
  type HoneConfig,
  type AgentType,
} from './config'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { extname, join, relative } from 'path'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { AgentClient } from './agent-client'
import { log, logError, logVerbose, logVerboseError } from './logger'

/**
 * Central constant for the agents documentation directory name
 * This can be made configurable via config file in the future if needed
 */
export const AGENTS_DOCS_DIR = '.agents-docs'

export interface AgentsMdGeneratorOptions {
  projectPath?: string
  overwrite?: boolean
  agent?: AgentType
}

export interface ProjectAnalysis {
  languages: string[]
  buildSystems: string[]
  testingFrameworks: string[]
  dependencies: string[]
  architecture: string[]
  deployment: string[]
}

export interface GenerationResult {
  success: boolean
  mainFilePath?: string
  agentsDirPath?: string
  filesCreated: string[]
  error?: Error
}

interface TemplateSection {
  title: string
  content: string
  priority: number
  detailFile?: string
}

type MetadataSection =
  | 'languages'
  | 'buildSystems'
  | 'testingFrameworks'
  | 'architecture'
  | 'deployment'

type MetadataSourceType = 'package.json' | 'workflow' | 'doc' | 'config' | 'agents-docs'

/** @internal */
export interface MetadataSignal {
  section: MetadataSection
  value: string
  sourceType: MetadataSourceType
  sourceTag: string
}

const METADATA_SOURCE_PRIORITY: Record<MetadataSourceType, number> = {
  'package.json': 0,
  workflow: 1,
  doc: 2,
  config: 3,
  'agents-docs': 4,
}

function addMetadataSignal(
  signals: MetadataSignal[],
  section: MetadataSection,
  value: string,
  sourceType: MetadataSourceType,
  sourceTag: string
): void {
  const normalized = value.trim()
  if (!normalized) return
  signals.push({
    section,
    value: normalized,
    sourceType,
    sourceTag,
  })
}

/** @internal */
export function dedupeMetadataSignals(signals: MetadataSignal[]): MetadataSignal[] {
  const sorted = [...signals].sort((a, b) => {
    const sourceCompare =
      METADATA_SOURCE_PRIORITY[a.sourceType] - METADATA_SOURCE_PRIORITY[b.sourceType]
    if (sourceCompare !== 0) return sourceCompare
    const tagCompare = a.sourceTag.localeCompare(b.sourceTag)
    if (tagCompare !== 0) return tagCompare
    return a.value.localeCompare(b.value)
  })

  const seen = new Set<string>()
  const deduped: MetadataSignal[] = []
  for (const signal of sorted) {
    const key = `${signal.section}::${signal.value.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(signal)
  }

  return deduped
}

function formatMetadataSection(signals: MetadataSignal[], section: MetadataSection): string[] {
  const sectionSignals = signals.filter(signal => signal.section === section)
  if (sectionSignals.length === 0) return []
  const includeTags = sectionSignals.length > 1
  return sectionSignals.map(signal =>
    includeTags ? `${signal.value} (${signal.sourceTag})` : signal.value
  )
}

/**
 * Extract preservable content (gotchas, custom learnings) from existing AGENTS.md
 * This function looks for custom sections that should be preserved when regenerating
 */
function extractPreservableContent(existingContent: string): string | null {
  const lines = existingContent.split('\n')
  const preservedSections: string[] = []
  let currentSection: string[] = []
  let inPreservableSection = false
  let sectionTitle = ''

  for (const line of lines) {
    if (!line) continue

    // Look for section headers that might contain gotchas/learnings
    if (line.startsWith('## ') || line.startsWith('# ')) {
      // Save previous section if it was preservable
      if (inPreservableSection && currentSection.length > 0) {
        preservedSections.push(`## ${sectionTitle}\n\n${currentSection.join('\n').trim()}`)
      }

      // Check if this is a section we want to preserve
      const title = line.replace(/^#+\s*/, '').toLowerCase()
      sectionTitle = line.replace(/^#+\s*/, '')
      inPreservableSection =
        title.includes('gotcha') ||
        title.includes('learning') ||
        title.includes('note') ||
        title.includes('warning') ||
        title.includes('tip') ||
        title.includes('custom') ||
        title.includes('specific') ||
        line.includes('PRESERVED CONTENT')

      currentSection = []
    } else if (inPreservableSection) {
      currentSection.push(line)
    }
  }

  // Don't forget the last section
  if (inPreservableSection && currentSection.length > 0) {
    preservedSections.push(`## ${sectionTitle}\n\n${currentSection.join('\n').trim()}`)
  }

  return preservedSections.length > 0 ? preservedSections.join('\n\n') : null
}

/**
 * Analyze project structure and gather context for AGENTS.md generation
 */
async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    languages: [],
    buildSystems: [],
    testingFrameworks: [],
    dependencies: [],
    architecture: [],
    deployment: [],
  }

  try {
    const metadataSignals: MetadataSignal[] = []
    collectPackageJsonMetadataSignals(projectPath, metadataSignals)
    collectConfigMetadataSignals(projectPath, metadataSignals)
    collectWorkflowMetadataSignals(projectPath, metadataSignals)
    collectDocsMetadataSignals(projectPath, metadataSignals)
    collectAgentsDocsMetadataSignals(projectPath, metadataSignals)

    const deduped = dedupeMetadataSignals(metadataSignals)
    analysis.languages = formatMetadataSection(deduped, 'languages')
    analysis.buildSystems = formatMetadataSection(deduped, 'buildSystems')
    analysis.testingFrameworks = formatMetadataSection(deduped, 'testingFrameworks')
    analysis.architecture = formatMetadataSection(deduped, 'architecture')
    analysis.deployment = formatMetadataSection(deduped, 'deployment')
    analysis.dependencies = collectPackageJsonDependencies(projectPath)

    logVerbose(`[AgentsMd] Project analysis complete: ${JSON.stringify(analysis, null, 2)}`)
    return analysis
  } catch (error) {
    logVerboseError(
      `[AgentsMd] Error analyzing project: ${error instanceof Error ? error.message : error}`
    )
    return analysis // Return partial analysis on error
  }
}

function readPackageJson(projectPath: string): Record<string, unknown> | null {
  const pkgPath = join(projectPath, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
  } catch (error) {
    logVerbose(`Could not parse package.json: ${error}`)
    return null
  }
}

function collectPackageJsonDependencies(projectPath: string): string[] {
  const pkg = readPackageJson(projectPath)
  if (!pkg) return []
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  const detected: string[] = []

  if (deps.react) detected.push('React')
  if (deps.next) detected.push('Next.js')
  if (deps.vue) detected.push('Vue.js')
  if (deps.express) detected.push('Express')
  if (deps.fastify) detected.push('Fastify')
  if (deps['commander'] || deps['commander.js']) detected.push('Commander.js')

  return detected
}

function collectPackageJsonMetadataSignals(projectPath: string, signals: MetadataSignal[]): void {
  const pkg = readPackageJson(projectPath)
  if (!pkg) return
  const sourceTag = 'package.json'
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }

  const scripts = pkg.scripts as Record<string, string> | undefined
  if (scripts && Object.keys(scripts).length > 0) {
    addMetadataSignal(signals, 'buildSystems', 'npm scripts', 'package.json', sourceTag)
  }

  const packageManager = typeof pkg.packageManager === 'string' ? pkg.packageManager : ''
  if (packageManager.startsWith('bun')) {
    addMetadataSignal(signals, 'buildSystems', 'Bun', 'package.json', sourceTag)
  }
  if (packageManager.startsWith('pnpm')) {
    addMetadataSignal(signals, 'buildSystems', 'pnpm', 'package.json', sourceTag)
  }
  if (packageManager.startsWith('yarn')) {
    addMetadataSignal(signals, 'buildSystems', 'Yarn', 'package.json', sourceTag)
  }
  if (packageManager.startsWith('npm')) {
    addMetadataSignal(signals, 'buildSystems', 'npm', 'package.json', sourceTag)
  }

  if (deps.typescript || deps['ts-node'] || deps.tsx) {
    addMetadataSignal(signals, 'languages', 'TypeScript', 'package.json', sourceTag)
  }

  if (deps.jest) addMetadataSignal(signals, 'testingFrameworks', 'Jest', 'package.json', sourceTag)
  if (deps.vitest)
    addMetadataSignal(signals, 'testingFrameworks', 'Vitest', 'package.json', sourceTag)
  if (deps.mocha)
    addMetadataSignal(signals, 'testingFrameworks', 'Mocha', 'package.json', sourceTag)
  if (deps.bun)
    addMetadataSignal(signals, 'testingFrameworks', 'Bun Test', 'package.json', sourceTag)
  if (deps['@playwright/test'] || deps.playwright) {
    addMetadataSignal(signals, 'testingFrameworks', 'Playwright', 'package.json', sourceTag)
  }
  if (deps.cypress)
    addMetadataSignal(signals, 'testingFrameworks', 'Cypress', 'package.json', sourceTag)

  if (deps.vite) addMetadataSignal(signals, 'buildSystems', 'Vite', 'package.json', sourceTag)
  if (deps.webpack) addMetadataSignal(signals, 'buildSystems', 'Webpack', 'package.json', sourceTag)
  if (deps.parcel) addMetadataSignal(signals, 'buildSystems', 'Parcel', 'package.json', sourceTag)
  if (deps.rollup) addMetadataSignal(signals, 'buildSystems', 'Rollup', 'package.json', sourceTag)
  if (deps.esbuild) addMetadataSignal(signals, 'buildSystems', 'esbuild', 'package.json', sourceTag)
}

function listFilesByExtensions(
  root: string,
  extensions: Set<string>,
  ignoreDirs: Set<string>
): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(root, entry.name)
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue
        files.push(...listFilesByExtensions(entryPath, extensions, ignoreDirs))
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (extensions.has(ext)) {
          files.push(entryPath)
        }
      }
    }
  } catch (error) {
    logVerbose('[AgentsMd] Could not read directory during metadata discovery')
  }

  return files.sort()
}

/** @internal */
export function collectConfigMetadataSignals(projectPath: string, signals: MetadataSignal[]): void {
  const ignoreDirs = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    'out',
    '.agents',
    AGENTS_DOCS_DIR,
    '.plans',
  ])

  const extensionMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.kts': 'Kotlin',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.cs': 'C#',
  }

  const extensions = new Set(Object.keys(extensionMap))
  const files = listFilesByExtensions(projectPath, extensions, ignoreDirs)
  const seenExtensions = new Set<string>()
  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase()
    if (seenExtensions.has(ext)) continue
    const language = extensionMap[ext]
    if (!language) continue
    seenExtensions.add(ext)
    addMetadataSignal(signals, 'languages', language, 'config', `config:ext:${ext.slice(1)}`)
  }

  if (existsSync(join(projectPath, 'tsconfig.json'))) {
    addMetadataSignal(signals, 'languages', 'TypeScript', 'config', 'config:tsconfig')
  }
  if (existsSync(join(projectPath, 'jsconfig.json'))) {
    addMetadataSignal(signals, 'languages', 'JavaScript', 'config', 'config:jsconfig')
  }

  if (existsSync(join(projectPath, 'go.mod'))) {
    addMetadataSignal(signals, 'languages', 'Go', 'config', 'config:go.mod')
    addMetadataSignal(signals, 'buildSystems', 'Go modules', 'config', 'config:go.mod')
  }
  if (existsSync(join(projectPath, 'Cargo.toml'))) {
    addMetadataSignal(signals, 'languages', 'Rust', 'config', 'config:cargo.toml')
    addMetadataSignal(signals, 'buildSystems', 'Cargo', 'config', 'config:cargo.toml')
  }
  if (existsSync(join(projectPath, 'pom.xml'))) {
    addMetadataSignal(signals, 'languages', 'Java', 'config', 'config:pom.xml')
    addMetadataSignal(signals, 'buildSystems', 'Maven', 'config', 'config:pom.xml')
  }
  if (
    existsSync(join(projectPath, 'build.gradle')) ||
    existsSync(join(projectPath, 'build.gradle.kts'))
  ) {
    addMetadataSignal(signals, 'languages', 'Java/Kotlin', 'config', 'config:gradle')
    addMetadataSignal(signals, 'buildSystems', 'Gradle', 'config', 'config:gradle')
  }

  if (
    existsSync(join(projectPath, 'requirements.txt')) ||
    existsSync(join(projectPath, 'pyproject.toml')) ||
    existsSync(join(projectPath, 'setup.py'))
  ) {
    addMetadataSignal(signals, 'languages', 'Python', 'config', 'config:python')
  }

  const pyprojectPath = join(projectPath, 'pyproject.toml')
  if (existsSync(pyprojectPath)) {
    try {
      const pyproject = readFileSync(pyprojectPath, 'utf-8').toLowerCase()
      if (pyproject.includes('[tool.poetry]')) {
        addMetadataSignal(signals, 'buildSystems', 'Poetry', 'config', 'config:pyproject')
      } else if (pyproject.includes('[tool.hatch]')) {
        addMetadataSignal(signals, 'buildSystems', 'Hatch', 'config', 'config:pyproject')
      } else if (pyproject.includes('[tool.flit]')) {
        addMetadataSignal(signals, 'buildSystems', 'Flit', 'config', 'config:pyproject')
      } else if (pyproject.includes('[build-system]')) {
        addMetadataSignal(
          signals,
          'buildSystems',
          'PEP 517 build backend',
          'config',
          'config:pyproject'
        )
      }
    } catch (error) {
      logVerbose('[AgentsMd] Could not read pyproject.toml for build detection')
    }
  }

  if (existsSync(join(projectPath, 'bun.lock')) || existsSync(join(projectPath, 'bun.lockb'))) {
    addMetadataSignal(signals, 'buildSystems', 'Bun', 'config', 'config:bun.lock')
  }
  if (existsSync(join(projectPath, 'package-lock.json'))) {
    addMetadataSignal(signals, 'buildSystems', 'npm', 'config', 'config:package-lock')
  }
  if (existsSync(join(projectPath, 'yarn.lock'))) {
    addMetadataSignal(signals, 'buildSystems', 'Yarn', 'config', 'config:yarn.lock')
  }
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
    addMetadataSignal(signals, 'buildSystems', 'pnpm', 'config', 'config:pnpm-lock')
  }
  if (existsSync(join(projectPath, 'Makefile'))) {
    addMetadataSignal(signals, 'buildSystems', 'Make', 'config', 'config:makefile')
  }
  if (
    existsSync(join(projectPath, 'vite.config.ts')) ||
    existsSync(join(projectPath, 'vite.config.js'))
  ) {
    addMetadataSignal(signals, 'buildSystems', 'Vite', 'config', 'config:vite')
  }
  if (
    existsSync(join(projectPath, 'webpack.config.js')) ||
    existsSync(join(projectPath, 'webpack.config.ts'))
  )
    addMetadataSignal(signals, 'buildSystems', 'Webpack', 'config', 'config:webpack')
  if (existsSync(join(projectPath, '.parcelrc'))) {
    addMetadataSignal(signals, 'buildSystems', 'Parcel', 'config', 'config:parcel')
  }
  if (
    existsSync(join(projectPath, 'rollup.config.js')) ||
    existsSync(join(projectPath, 'rollup.config.ts'))
  ) {
    addMetadataSignal(signals, 'buildSystems', 'Rollup', 'config', 'config:rollup')
  }

  if (
    existsSync(join(projectPath, 'jest.config.js')) ||
    existsSync(join(projectPath, 'jest.config.ts'))
  )
    addMetadataSignal(signals, 'testingFrameworks', 'Jest', 'config', 'config:jest')
  if (
    existsSync(join(projectPath, 'vitest.config.js')) ||
    existsSync(join(projectPath, 'vitest.config.ts'))
  ) {
    addMetadataSignal(signals, 'testingFrameworks', 'Vitest', 'config', 'config:vitest')
  }
  if (
    existsSync(join(projectPath, 'playwright.config.ts')) ||
    existsSync(join(projectPath, 'playwright.config.js'))
  ) {
    addMetadataSignal(signals, 'testingFrameworks', 'Playwright', 'config', 'config:playwright')
  }
  if (
    existsSync(join(projectPath, 'cypress.config.ts')) ||
    existsSync(join(projectPath, 'cypress.config.js'))
  ) {
    addMetadataSignal(signals, 'testingFrameworks', 'Cypress', 'config', 'config:cypress')
  }
  if (existsSync(join(projectPath, 'pytest.ini')))
    addMetadataSignal(signals, 'testingFrameworks', 'pytest', 'config', 'config:pytest')
  if (existsSync(join(projectPath, 'tox.ini')))
    addMetadataSignal(signals, 'testingFrameworks', 'tox', 'config', 'config:tox')

  if (existsSync(join(projectPath, 'src'))) {
    addMetadataSignal(signals, 'architecture', 'src/ directory structure', 'config', 'config:src')
  }
  if (existsSync(join(projectPath, 'apps')) || existsSync(join(projectPath, 'packages'))) {
    addMetadataSignal(
      signals,
      'architecture',
      'monorepo workspace layout',
      'config',
      'config:workspaces'
    )
  }
  if (existsSync(join(projectPath, 'docker-compose.yml'))) {
    addMetadataSignal(signals, 'architecture', 'Docker Compose', 'config', 'config:docker-compose')
    addMetadataSignal(signals, 'deployment', 'Docker Compose', 'config', 'config:docker-compose')
  }
  if (existsSync(join(projectPath, 'Dockerfile'))) {
    addMetadataSignal(
      signals,
      'architecture',
      'Docker containerization',
      'config',
      'config:dockerfile'
    )
    addMetadataSignal(
      signals,
      'deployment',
      'Docker containerization',
      'config',
      'config:dockerfile'
    )
  }

  if (existsSync(join(projectPath, 'vercel.json'))) {
    addMetadataSignal(signals, 'deployment', 'Vercel', 'config', 'config:vercel')
  }
  if (existsSync(join(projectPath, 'netlify.toml'))) {
    addMetadataSignal(signals, 'deployment', 'Netlify', 'config', 'config:netlify')
  }
  if (existsSync(join(projectPath, 'fly.toml'))) {
    addMetadataSignal(signals, 'deployment', 'Fly.io', 'config', 'config:fly')
  }
  if (existsSync(join(projectPath, 'render.yaml')) || existsSync(join(projectPath, 'render.yml'))) {
    addMetadataSignal(signals, 'deployment', 'Render', 'config', 'config:render')
  }
  if (existsSync(join(projectPath, 'railway.json'))) {
    addMetadataSignal(signals, 'deployment', 'Railway', 'config', 'config:railway')
  }
}

/** @internal */
export function collectWorkflowMetadataSignals(
  projectPath: string,
  signals: MetadataSignal[]
): void {
  const workflowsPath = join(projectPath, WORKFLOW_DIR)
  if (!existsSync(workflowsPath)) return
  try {
    const workflowFiles = readdirSync(workflowsPath)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .sort()
    if (workflowFiles.length === 0) return
    const sourceTag = `workflow:${workflowFiles[0]}`
    addMetadataSignal(signals, 'architecture', 'GitHub Actions CI/CD', 'workflow', sourceTag)
    addMetadataSignal(signals, 'deployment', 'GitHub Actions CI/CD', 'workflow', sourceTag)
  } catch (error) {
    logVerbose('[AgentsMd] Could not read workflow metadata')
  }
}

function extractBracketedList(content: string, label: string): string[] {
  const regex = new RegExp(`^\\s*${label}\\s*:\\s*\\[([^\\]]*)\\]`, 'im')
  const match = content.match(regex)
  if (!match) return []
  const list = match[1] ?? ''
  return list
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function extractLabeledValue(content: string, label: string): string {
  const regex = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im')
  const match = content.match(regex)
  return match?.[1]?.trim() ?? ''
}

/** @internal */
export function collectDocsMetadataSignals(projectPath: string, signals: MetadataSignal[]): void {
  const files = listMarkdownFiles(projectPath)
  for (const filePath of files) {
    let content = ''
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch (error) {
      logVerbose('[AgentsMd] Could not read markdown for metadata discovery')
      continue
    }
    const relativePath = relative(projectPath, filePath)
    const sourceTag = `doc:${relativePath}`

    for (const language of extractBracketedList(content, 'PRIMARY LANGUAGES')) {
      addMetadataSignal(signals, 'languages', language, 'doc', sourceTag)
    }
    for (const system of extractBracketedList(content, 'BUILD SYSTEMS')) {
      addMetadataSignal(signals, 'buildSystems', system, 'doc', sourceTag)
    }
    for (const framework of extractBracketedList(content, 'TESTING FRAMEWORKS')) {
      addMetadataSignal(signals, 'testingFrameworks', framework, 'doc', sourceTag)
    }

    const architectureLabels = [
      'ARCHITECTURE PATTERN',
      'DIRECTORY STRUCTURE',
      'DESIGN PATTERNS',
      'DATABASE',
      'API DESIGN',
    ]
    for (const label of architectureLabels) {
      const value = extractLabeledValue(content, label)
      if (value) addMetadataSignal(signals, 'architecture', value, 'doc', sourceTag)
    }

    const deploymentLabels = [
      'DEPLOYMENT STRATEGY',
      'CONTAINERIZATION',
      'CI/CD',
      'HOSTING',
      'ENVIRONMENT MANAGEMENT',
    ]
    for (const label of deploymentLabels) {
      const value = extractLabeledValue(content, label)
      if (value) addMetadataSignal(signals, 'deployment', value, 'doc', sourceTag)
    }
  }
}

/** @internal */
export function collectAgentsDocsMetadataSignals(
  projectPath: string,
  signals: MetadataSignal[]
): void {
  const agentsDocsPath = join(projectPath, AGENTS_DOCS_DIR)
  if (!existsSync(agentsDocsPath)) return
  const files = listFilesRecursive(agentsDocsPath, filePath => filePath.endsWith('.md'))
  for (const filePath of files) {
    let content = ''
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch (error) {
      logVerbose('[AgentsMd] Could not read agents-docs metadata file')
      continue
    }
    const relativePath = relative(agentsDocsPath, filePath)
    const sourceTag = `agents-docs:${relativePath}`

    for (const language of extractBracketedList(content, 'PRIMARY LANGUAGES')) {
      addMetadataSignal(signals, 'languages', language, 'agents-docs', sourceTag)
    }
    for (const system of extractBracketedList(content, 'BUILD SYSTEMS')) {
      addMetadataSignal(signals, 'buildSystems', system, 'agents-docs', sourceTag)
    }
    for (const framework of extractBracketedList(content, 'TESTING FRAMEWORKS')) {
      addMetadataSignal(signals, 'testingFrameworks', framework, 'agents-docs', sourceTag)
    }

    const architectureLabels = [
      'ARCHITECTURE PATTERN',
      'DIRECTORY STRUCTURE',
      'DESIGN PATTERNS',
      'DATABASE',
      'API DESIGN',
    ]
    for (const label of architectureLabels) {
      const value = extractLabeledValue(content, label)
      if (value) addMetadataSignal(signals, 'architecture', value, 'agents-docs', sourceTag)
    }

    const deploymentLabels = [
      'DEPLOYMENT STRATEGY',
      'CONTAINERIZATION',
      'CI/CD',
      'HOSTING',
      'ENVIRONMENT MANAGEMENT',
    ]
    for (const label of deploymentLabels) {
      const value = extractLabeledValue(content, label)
      if (value) addMetadataSignal(signals, 'deployment', value, 'agents-docs', sourceTag)
    }
  }
}

/**
 * Discovery prompts for analyzing different aspects of the project
 */
const DISCOVERY_PROMPTS = {
  languages: `Analyze this project's codebase to identify the primary programming languages used and their purposes.

IMPORTANT LANGUAGE DETECTION RULES:
- Look for source code files (.js, .ts, .py, .java, .go, .rs, .php, .rb, etc.)
- Check package.json, requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle for dependencies
- Identify language-specific configuration files (tsconfig.json, .eslintrc, setup.py, etc.)
- For TypeScript projects, note if it's primarily TypeScript or mixed JS/TS
- For frontend projects, distinguish between client-side and server-side languages

CRITICAL: Your response MUST start directly with the structured format below. NO preambles like "Based on my analysis..." or "Here's what I found..." - start IMMEDIATELY with "PRIMARY LANGUAGES:".

PRIMARY LANGUAGES: [language 1, language 2, ...]
USAGE CONTEXT: [brief explanation of how each language is used in the project]`,

  buildSystems: `Analyze this project to identify build systems, package managers, and compilation/bundling tools.

BUILD SYSTEM DETECTION RULES:
- npm/yarn/pnpm: Look for package.json, package-lock.json, yarn.lock, pnpm-lock.yaml
- Maven: Look for pom.xml, maven-wrapper files
- Gradle: Look for build.gradle, gradlew files
- Go modules: Look for go.mod, go.sum
- Cargo: Look for Cargo.toml, Cargo.lock
- Webpack: Look for webpack.config.js, webpack configurations
- Vite: Look for vite.config.ts/js
- Parcel: Look for .parcelrc, parcel configurations
- Build scripts in package.json (build, bundle, compile commands)
- Docker: Look for Dockerfile, docker-compose.yml
- Make: Look for Makefile
- Custom build scripts in various languages

CRITICAL: Your response MUST start directly with the structured format below. NO preambles like "Based on my analysis..." or "Here's what I found..." - start IMMEDIATELY with "BUILD SYSTEMS:".

BUILD SYSTEMS: [system 1, system 2, ...]
BUILD COMMANDS: [key build commands developers should know]
BUNDLING: [bundling tools if applicable]`,

  testing: `Identify testing frameworks, test organization patterns, and testing strategies used in this project.

TESTING FRAMEWORK DETECTION:
- JavaScript/TypeScript: Jest, Vitest, Mocha, Cypress, Playwright, Testing Library
- Python: pytest, unittest, nose, tox
- Java: JUnit, TestNG, Mockito, Spring Test
- Go: built-in testing, Testify, Ginkgo
- Rust: built-in testing, proptest, criterion
- Ruby: RSpec, minitest
- PHP: PHPUnit, Pest

Look for:
- Test files (*.test.*, *.spec.*, *_test.*, test_*.py)
- Test directories (/test, /tests, /__tests__)
- Configuration files (jest.config.js, vitest.config.ts, pytest.ini)
- CI/CD test configurations
- Mock/stub patterns
- E2E testing setup

CRITICAL: Your response MUST start directly with the structured format below. NO preambles like "Based on my analysis..." or "Here's what I found..." - start IMMEDIATELY with "TESTING FRAMEWORKS:".

TESTING FRAMEWORKS: [framework 1, framework 2, ...]
TEST COMMANDS: [how to run tests]
TEST ORGANIZATION: [how tests are structured and organized]
E2E TESTING: [end-to-end testing approach if present]`,

  architecture: `Analyze the project's architectural patterns, directory structure, and design decisions.

ARCHITECTURE ANALYSIS AREAS:
- Directory/folder structure and organization
- Design patterns (MVC, MVP, MVVM, layered architecture, microservices, etc.)
- Code organization (modules, packages, namespaces)
- Database integration patterns
- API design patterns (REST, GraphQL, RPC)
- Configuration management
- Dependency injection patterns
- Error handling patterns
- Logging and monitoring
- Security patterns
- Performance considerations

Examine:
- Source code organization in src/, lib/, app/ directories
- Configuration files and their patterns
- Database schema or ORM usage
- API endpoint definitions
- Middleware/interceptor patterns
- Shared utilities and common code

CRITICAL: Your response MUST start directly with the structured format below. NO preambles like "Based on my analysis..." or "Here's what I found..." - start IMMEDIATELY with "ARCHITECTURE PATTERN:".

ARCHITECTURE PATTERN: [primary architectural pattern]
DIRECTORY STRUCTURE: [key organizational principles]
DESIGN PATTERNS: [notable design patterns in use]
DATABASE: [data layer architecture if applicable]
API DESIGN: [API architectural patterns if applicable]`,

  deployment: `Analyze deployment strategies, infrastructure patterns, and operational considerations for this project.

DEPLOYMENT ANALYSIS:
- Containerization (Docker, Podman)
- Container orchestration (Kubernetes, Docker Swarm, Docker Compose)
- Cloud platforms (AWS, GCP, Azure, Vercel, Netlify, Railway)
- CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins, CircleCI)
- Infrastructure as Code (Terraform, CloudFormation, Pulumi)
- Serverless deployment (Lambda, Cloud Functions, Vercel Functions)
- Static site deployment
- Database deployment and migrations
- Environment configuration management
- Monitoring and logging setup

Look for:
- Dockerfile, docker-compose.yml
- .github/workflows/, .gitlab-ci.yml, Jenkinsfile
- Cloud provider configuration files
- Deployment scripts
- Environment variable configurations (.env patterns)
- Database migration files
- Package.json deploy scripts

CRITICAL: Your response MUST start directly with the structured format below. NO preambles like "Based on my analysis..." or "Here's what I found..." - start IMMEDIATELY with "DEPLOYMENT STRATEGY:".

DEPLOYMENT STRATEGY: [primary deployment approach]
CONTAINERIZATION: [Docker/container usage]
CI/CD: [continuous integration/deployment setup]
HOSTING: [where the application is designed to be hosted]
ENVIRONMENT MANAGEMENT: [how environments are configured]`,
}

/**
 * Execute a discovery prompt against the project using agent
 */
async function executeDiscoveryPrompt(
  projectPath: string,
  promptKey: keyof typeof DISCOVERY_PROMPTS,
  config: HoneConfig,
  agent?: AgentType
): Promise<string> {
  const resolvedAgent = agent || config.defaultAgent
  const model = resolveModelForPhase(config, 'agentsMd', resolvedAgent) // Use agentsMd phase model with resolved agent
  const client = new AgentClient({
    agent: resolvedAgent,
    model,
    workingDir: projectPath,
  })

  logVerbose(`[AgentsMd] Executing ${promptKey} discovery prompt`)

  try {
    const response = await client.messages.create({
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: 'Analyze the project and provide the requested analysis.',
        },
      ],
      system: DISCOVERY_PROMPTS[promptKey],
    })

    const content = response.content[0]
    const result = content && content.type === 'text' ? content.text.trim() : ''

    logVerbose(`[AgentsMd] Completed ${promptKey} discovery: ${result.substring(0, 100)}...`)
    return result
  } catch (error) {
    logVerboseError(
      `[AgentsMd] Failed ${promptKey} discovery: ${error instanceof Error ? error.message : error}`
    )
    return `Error analyzing ${promptKey}: ${error instanceof Error ? error.message : error}`
  }
}

/**
 * Execute parallel agent-based project scanning
 */
async function executeParallelScanning(
  projectPath: string,
  config: HoneConfig,
  agent?: AgentType
): Promise<Record<keyof typeof DISCOVERY_PROMPTS, string>> {
  const promptKeys = Object.keys(DISCOVERY_PROMPTS) as (keyof typeof DISCOVERY_PROMPTS)[]

  logVerbose(`[AgentsMd] Starting parallel scanning with ${promptKeys.length} discovery prompts`)

  // Execute all discovery prompts in parallel to stay within 90-second limit
  const results = await Promise.all(
    promptKeys.map(async key => ({
      key,
      result: await executeDiscoveryPrompt(projectPath, key, config, agent),
    }))
  )

  // Convert results array to object
  const scanResults = Object.fromEntries(results.map(({ key, result }) => [key, result])) as Record<
    keyof typeof DISCOVERY_PROMPTS,
    string
  >

  logVerbose(`[AgentsMd] Parallel scanning completed with results for: ${promptKeys.join(', ')}`)
  return scanResults
}

/**
 * Generate project-specific feedback commands based on multi-source repo signals
 */
type CommandCategory = 'tests' | 'format' | 'lint' | 'yamlFormat' | 'yamlLint' | 'build'
type SourceType = 'package.json' | 'workflow' | 'doc' | 'config' | 'agents-docs' | 'analysis'

interface CommandSignal {
  category: CommandCategory
  command: string
  sourceType: SourceType
  sourceTag: string
}

const COMMAND_CATEGORY_LABELS: Record<CommandCategory, string> = {
  tests: 'Unit Tests',
  format: 'Code Formatting',
  lint: 'Code Linting',
  yamlFormat: 'YAML Formatting',
  yamlLint: 'YAML Linting',
  build: 'Build',
}

const SOURCE_TYPE_PRIORITY: Record<SourceType, number> = {
  'package.json': 0,
  workflow: 1,
  doc: 2,
  config: 3,
  'agents-docs': 4,
  analysis: 5,
}

const WORKFLOW_DIR = join('.github', 'workflows')

/** @internal */
export function normalizeCommand(command: string): string {
  return command
    .replace(/`/g, '')
    .replace(/^\$\s+/, '')
    .replace(/^\>\s+/, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function splitCommandSegments(command: string): string[] {
  return command
    .split(/&&|;/)
    .map(segment => normalizeCommand(segment))
    .filter(Boolean)
}

/** @internal */
export function categorizeCommand(command: string): CommandCategory[] {
  const normalized = command.toLowerCase()
  const categories = new Set<CommandCategory>()
  const mentionsYaml = normalized.includes('yaml') || normalized.includes('yml')

  const isTest =
    normalized.includes(' test') ||
    normalized.startsWith('test ') ||
    normalized.includes('jest') ||
    normalized.includes('vitest') ||
    normalized.includes('pytest') ||
    normalized.includes('mocha') ||
    normalized.includes('bun test') ||
    normalized.includes('go test') ||
    normalized.includes('cargo test') ||
    normalized.includes('playwright test') ||
    normalized.includes('cypress run')

  const isBuild =
    normalized.includes(' build') ||
    normalized.startsWith('build ') ||
    normalized.includes('webpack') ||
    normalized.includes('vite build') ||
    normalized.includes('bun build') ||
    normalized.includes('cargo build') ||
    normalized.includes('go build') ||
    normalized.includes('mvn ') ||
    normalized.includes('gradle')

  const isLint = (normalized.includes('lint') || normalized.includes('eslint')) && !mentionsYaml
  const isFormat =
    (normalized.includes('format') ||
      normalized.includes('prettier') ||
      normalized.includes('fmt')) &&
    !mentionsYaml
  const isYamlLint =
    mentionsYaml && (normalized.includes('lint') || normalized.includes('yamllint'))
  const isYamlFormat =
    mentionsYaml &&
    (normalized.includes('format') || normalized.includes('prettier') || normalized.includes('fmt'))
  const isYamlCheck = mentionsYaml && normalized.includes('check')

  if (isTest) categories.add('tests')
  if (isBuild) categories.add('build')
  if (isLint) categories.add('lint')
  if (isFormat) categories.add('format')
  if (isYamlLint) categories.add('yamlLint')
  if (isYamlFormat) categories.add('yamlFormat')
  if (isYamlCheck) {
    categories.add('yamlLint')
    categories.add('yamlFormat')
  }

  return Array.from(categories)
}

/** @internal */
export function categorizeScriptName(scriptName: string, scriptValue: string): CommandCategory[] {
  const normalizedName = scriptName.toLowerCase()
  const normalizedValue = scriptValue.toLowerCase()
  const categories = new Set<CommandCategory>()

  if (normalizedName.includes('test')) categories.add('tests')
  if (normalizedName === 'build' || normalizedName.startsWith('build:')) categories.add('build')
  if (normalizedName.startsWith('build:') && normalizedValue.includes('test')) {
    categories.add('tests')
  }
  if (normalizedName.includes('lint')) {
    if (normalizedName.includes('yaml')) {
      categories.add('yamlLint')
    } else {
      categories.add('lint')
    }
  }
  if (normalizedName.includes('format') || normalizedName.includes('fmt')) {
    if (normalizedName.includes('yaml')) {
      categories.add('yamlFormat')
    } else {
      categories.add('format')
    }
  }
  if (normalizedName.includes('check') && normalizedName.includes('yaml')) {
    categories.add('yamlLint')
    categories.add('yamlFormat')
  }

  if (categories.size === 0) {
    return categorizeCommand(scriptValue)
  }

  return Array.from(categories)
}

function addCommandSignals(
  signals: CommandSignal[],
  categories: CommandCategory[],
  command: string,
  sourceType: SourceType,
  sourceTag: string
): void {
  if (categories.length === 0) return
  const normalized = normalizeCommand(command)
  if (!normalized) return

  for (const category of categories) {
    signals.push({
      category,
      command: normalized,
      sourceType,
      sourceTag,
    })
  }
}

function listMarkdownFiles(projectPath: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(projectPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        if (entry.name === 'AGENTS.md') continue
        files.push(join(projectPath, entry.name))
      }
    }
  } catch (error) {
    logVerbose('[AgentsMd] Could not read top-level markdown files')
  }

  const docsPath = join(projectPath, 'docs')
  if (existsSync(docsPath)) {
    files.push(...listFilesRecursive(docsPath, filePath => filePath.endsWith('.md')))
  }

  return files.sort()
}

function listFilesRecursive(root: string, matcher: (filePath: string) => boolean): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(root, entry.name)
      if (entry.isDirectory()) {
        files.push(...listFilesRecursive(entryPath, matcher))
      } else if (entry.isFile() && matcher(entryPath)) {
        files.push(entryPath)
      }
    }
  } catch (error) {
    logVerbose('[AgentsMd] Could not read directory during command discovery')
  }

  return files.sort()
}

/** @internal */
export function extractCommandsFromMarkdown(content: string): string[] {
  const commands: string[] = []
  const lines = content.split('\n')
  let inCodeBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      const cleaned = trimmed.replace(/^[-*+]\s+/, '')
      if (categorizeCommand(cleaned).length > 0) {
        commands.push(...splitCommandSegments(cleaned))
      }
      continue
    }

    const inlineMatches = trimmed.matchAll(/`([^`]+)`/g)
    for (const match of inlineMatches) {
      const inlineCommand = match[1]?.trim() || ''
      if (categorizeCommand(inlineCommand).length > 0) {
        commands.push(...splitCommandSegments(inlineCommand))
      }
    }
  }

  return commands
}

/** @internal */
export function extractRunCommandsFromWorkflow(content: string): string[] {
  const commands: string[] = []
  const lines = content.split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const runMatch = line.match(/^(\s*)run:\s*(.*)$/)

    if (runMatch) {
      const indent = runMatch[1]?.length ?? 0
      const runValue = runMatch[2]?.trim() ?? ''

      if (runValue === '|' || runValue === '>') {
        index += 1
        const blockLines: string[] = []
        while (index < lines.length) {
          const nextLine = lines[index] ?? ''
          const nextIndent = (nextLine.match(/^(\s*)/) || [''])[0].length
          if (nextLine.trim() && nextIndent <= indent) break
          if (nextLine.trim()) {
            blockLines.push(nextLine.trim())
          }
          index += 1
        }
        commands.push(...blockLines)
        continue
      }

      if (runValue) {
        commands.push(runValue)
      }
    }

    index += 1
  }

  return commands
}

function collectConfigCommands(projectPath: string, signals: CommandSignal[]): void {
  const configChecks = [
    {
      name: 'eslint',
      files: [
        '.eslintrc',
        '.eslintrc.js',
        '.eslintrc.cjs',
        '.eslintrc.json',
        '.eslintrc.yml',
        '.eslintrc.yaml',
        'eslint.config.js',
        'eslint.config.cjs',
        'eslint.config.mjs',
        'eslint.config.ts',
      ],
      command: 'eslint . --fix',
      categories: ['lint'] as CommandCategory[],
    },
    {
      name: 'prettier',
      files: [
        '.prettierrc',
        '.prettierrc.json',
        '.prettierrc.yml',
        '.prettierrc.yaml',
        '.prettierrc.js',
        '.prettierrc.cjs',
        '.prettierrc.mjs',
        'prettier.config.js',
        'prettier.config.cjs',
        'prettier.config.mjs',
      ],
      command: 'prettier --write "**/*.{ts,tsx,js,jsx}"',
      categories: ['format'] as CommandCategory[],
    },
    {
      name: 'yamllint',
      files: ['.yamllint.yml', '.yamllint.yaml'],
      command: 'yamllint -c .yamllint.yml **/*.yml **/*.yaml',
      categories: ['yamlLint'] as CommandCategory[],
    },
    {
      name: 'jest',
      files: ['jest.config.js', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.ts'],
      command: 'jest',
      categories: ['tests'] as CommandCategory[],
    },
    {
      name: 'vitest',
      files: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'],
      command: 'vitest',
      categories: ['tests'] as CommandCategory[],
    },
    {
      name: 'playwright',
      files: ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'],
      command: 'playwright test',
      categories: ['tests'] as CommandCategory[],
    },
    {
      name: 'cypress',
      files: ['cypress.config.ts', 'cypress.config.js', 'cypress.config.mjs'],
      command: 'cypress run',
      categories: ['tests'] as CommandCategory[],
    },
    {
      name: 'vite',
      files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'],
      command: 'vite build',
      categories: ['build'] as CommandCategory[],
    },
    {
      name: 'webpack',
      files: ['webpack.config.js', 'webpack.config.cjs', 'webpack.config.ts'],
      command: 'webpack',
      categories: ['build'] as CommandCategory[],
    },
  ]

  for (const check of configChecks) {
    const hasConfig = check.files.some(file => existsSync(join(projectPath, file)))
    if (hasConfig) {
      addCommandSignals(signals, check.categories, check.command, 'config', `config:${check.name}`)
    }
  }
}

function collectPackageJsonCommands(projectPath: string, signals: CommandSignal[]): void {
  try {
    const packageJsonPath = join(projectPath, 'package.json')
    if (!existsSync(packageJsonPath)) return
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const scripts: Record<string, string> = packageJson.scripts || {}

    for (const [scriptName, scriptValue] of Object.entries(scripts)) {
      const categories = categorizeScriptName(scriptName, scriptValue)
      if (categories.length === 0) continue
      addCommandSignals(
        signals,
        categories,
        `npm run ${scriptName}`,
        'package.json',
        'package.json'
      )
    }
  } catch (error) {
    logVerbose('[AgentsMd] Could not read package.json scripts')
  }
}

function collectWorkflowCommands(projectPath: string, signals: CommandSignal[]): void {
  const workflowsPath = join(projectPath, WORKFLOW_DIR)
  if (!existsSync(workflowsPath)) return

  try {
    const workflowFiles = readdirSync(workflowsPath)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .sort()

    for (const file of workflowFiles) {
      const filePath = join(workflowsPath, file)
      const content = readFileSync(filePath, 'utf-8')
      const runCommands = extractRunCommandsFromWorkflow(content)

      for (const runCommand of runCommands) {
        for (const segment of splitCommandSegments(runCommand)) {
          const categories = categorizeCommand(segment)
          addCommandSignals(signals, categories, segment, 'workflow', `workflow:${file}`)
        }
      }
    }
  } catch (error) {
    logVerbose('[AgentsMd] Could not read workflow files for command discovery')
  }
}

function collectDocCommands(projectPath: string, signals: CommandSignal[]): void {
  const docFiles = listMarkdownFiles(projectPath)

  for (const filePath of docFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const commands = extractCommandsFromMarkdown(content)
      const relativePath = relative(projectPath, filePath)
      for (const command of commands) {
        const categories = categorizeCommand(command)
        addCommandSignals(signals, categories, command, 'doc', `doc:${relativePath}`)
      }
    } catch (error) {
      logVerbose(`[AgentsMd] Could not read doc file for command discovery: ${filePath}`)
    }
  }
}

function collectAgentsDocsCommands(projectPath: string, signals: CommandSignal[]): void {
  const agentsDocsPath = join(projectPath, AGENTS_DOCS_DIR)
  if (!existsSync(agentsDocsPath)) return

  const files = listFilesRecursive(agentsDocsPath, filePath => filePath.endsWith('.md'))
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const commands = extractCommandsFromMarkdown(content)
      const relativePath = relative(agentsDocsPath, filePath)
      for (const command of commands) {
        const categories = categorizeCommand(command)
        addCommandSignals(
          signals,
          categories,
          command,
          'agents-docs',
          `agents-docs:${relativePath}`
        )
      }
    } catch (error) {
      logVerbose(`[AgentsMd] Could not read agents-docs file for command discovery: ${filePath}`)
    }
  }
}

function inferFallbackCommands(analysis: ProjectAnalysis, signals: CommandSignal[]): void {
  const frameworks = analysis.testingFrameworks.map(fw => fw.toLowerCase())
  if (frameworks.some(fw => fw.includes('bun'))) {
    addCommandSignals(signals, ['tests'], 'bun test', 'analysis', 'analysis:bun')
  }
  if (frameworks.some(fw => fw.includes('jest'))) {
    addCommandSignals(signals, ['tests'], 'jest', 'analysis', 'analysis:jest')
  }
  if (frameworks.some(fw => fw.includes('pytest'))) {
    addCommandSignals(signals, ['tests'], 'pytest', 'analysis', 'analysis:pytest')
  }

  const buildSystems = analysis.buildSystems.map(sys => sys.toLowerCase())
  if (buildSystems.some(sys => sys.includes('bun'))) {
    addCommandSignals(signals, ['build'], 'bun run build', 'analysis', 'analysis:bun')
  }
  if (buildSystems.some(sys => sys.includes('maven'))) {
    addCommandSignals(signals, ['build'], 'mvn clean compile', 'analysis', 'analysis:maven')
  }
  if (buildSystems.some(sys => sys.includes('gradle'))) {
    addCommandSignals(signals, ['build'], './gradlew build', 'analysis', 'analysis:gradle')
  }
}

/** @internal */
export function collectCommandSignals(
  projectPath: string,
  analysis: ProjectAnalysis
): CommandSignal[] {
  const signals: CommandSignal[] = []

  collectPackageJsonCommands(projectPath, signals)
  collectWorkflowCommands(projectPath, signals)
  collectDocCommands(projectPath, signals)
  collectConfigCommands(projectPath, signals)
  collectAgentsDocsCommands(projectPath, signals)
  inferFallbackCommands(analysis, signals)

  const seen = new Set<string>()
  const deduped: CommandSignal[] = []
  for (const signal of signals) {
    const key = `${signal.sourceTag}::${normalizeCommand(signal.command)}::${signal.category}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(signal)
  }

  deduped.sort((a, b) => {
    const sourceCompare = SOURCE_TYPE_PRIORITY[a.sourceType] - SOURCE_TYPE_PRIORITY[b.sourceType]
    if (sourceCompare !== 0) return sourceCompare
    const tagCompare = a.sourceTag.localeCompare(b.sourceTag)
    if (tagCompare !== 0) return tagCompare
    return a.command.localeCompare(b.command)
  })

  return deduped
}

function formatTaggedCommands(commands: CommandSignal[]): string {
  return commands.map(command => `\`${command.command}\` (${command.sourceTag})`).join('; ')
}

function generateFeedbackContent(projectPath: string, analysis: ProjectAnalysis): string {
  const feedbackCommands: string[] = []
  const signals = collectCommandSignals(projectPath, analysis)

  const commandsByCategory = new Map<CommandCategory, CommandSignal[]>()
  for (const signal of signals) {
    const existing = commandsByCategory.get(signal.category) || []
    existing.push(signal)
    commandsByCategory.set(signal.category, existing)
  }

  const orderedCategories: CommandCategory[] = [
    'tests',
    'format',
    'lint',
    'yamlFormat',
    'yamlLint',
    'build',
  ]

  for (const category of orderedCategories) {
    const commands = commandsByCategory.get(category)
    if (!commands || commands.length === 0) continue
    const label = COMMAND_CATEGORY_LABELS[category]
    feedbackCommands.push(`**${label}:** ${formatTaggedCommands(commands)}`)
  }

  return `Run these commands to validate your changes before committing:

${feedbackCommands.join('\n\n')}

These commands are project-specific based on the configured scripts and tooling.`
}

/**
 * Create adaptive template sections based on discovered tech stack
 */
function createTemplateSections(
  scanResults: Record<keyof typeof DISCOVERY_PROMPTS, string>,
  analysis: ProjectAnalysis,
  projectPath: string
): TemplateSection[] {
  const sections: TemplateSection[] = []

  // Build content using agent discovery results with static analysis fallback
  const getContentWithFallback = (agentResult: string | undefined, fallbackData: string[]) => {
    if (
      agentResult &&
      !agentResult.includes('failed to analyze') &&
      !agentResult.includes('Error:')
    ) {
      return agentResult
    }
    return fallbackData.length > 0
      ? `Static analysis detected: ${fallbackData.join(', ')}`
      : 'Not available.'
  }

  // High priority sections (always include)
  sections.push({
    title: 'Project Overview',
    content: getContentWithFallback(scanResults.languages || '', analysis.languages),
    priority: 1,
    detailFile: 'languages.md',
  })

  sections.push({
    title: 'Build System',
    content: getContentWithFallback(scanResults.buildSystems || '', analysis.buildSystems),
    priority: 2,
    detailFile: 'build.md',
  })

  // Medium priority sections (include if they have significant content)
  const testingContent = getContentWithFallback(
    scanResults.testing || '',
    analysis.testingFrameworks
  )
  if (testingContent && !testingContent.includes('Not available')) {
    sections.push({
      title: 'Testing Framework',
      content: testingContent,
      priority: 3,
      detailFile: 'testing.md',
    })
  }

  const architectureContent = getContentWithFallback(
    scanResults.architecture || '',
    analysis.architecture
  )
  if (architectureContent && !architectureContent.includes('Not available')) {
    sections.push({
      title: 'Architecture',
      content: architectureContent,
      priority: 4,
      detailFile: 'architecture.md',
    })
  }

  // Lower priority sections (include if space allows)
  const deploymentContent = getContentWithFallback(
    scanResults.deployment || '',
    analysis.deployment
  )
  if (deploymentContent && !deploymentContent.includes('not available')) {
    sections.push({
      title: 'Deployment',
      content: deploymentContent,
      priority: 5,
      detailFile: 'deployment.md',
    })
  }

  // Add feedback section inline at the top with project-specific commands
  sections.push({
    title: 'Feedback Instructions',
    content: generateFeedbackContent(projectPath, analysis),
    priority: 0, // Highest priority to appear at top
    detailFile: undefined, // Force inline, never create separate file
  })

  // Sort by priority
  return sections.sort((a, b) => a.priority - b.priority)
}

/**
 * Count lines in text content
 */
function countLines(text: string): number {
  return text.split('\n').length
}

/**
 * Generate compact AGENTS.md content that fits within 100-line limit
 */
function generateCompactContent(sections: TemplateSection[], useAgentsDir: boolean): string {
  const header = `# AGENTS.md

Learnings and patterns for future agents working on this project.
`

  if (!useAgentsDir) {
    // Full content in main file
    const fullSections = sections
      .map(
        section => `## ${section.title}

${section.content}
`
      )
      .join('\n')

    return (
      header +
      '\n' +
      fullSections +
      `
---

*This AGENTS.md was generated using agent-based project discovery.*
`
    )
  }

  // Compact version with references to ${AGENTS_DOCS_DIR}/ files, but keep inline sections inline
  const compactSections = sections
    .map(section => {
      // If section has no detailFile, render it inline (like Feedback Instructions)
      if (!section.detailFile) {
        return `## ${section.title}

${section.content}
`
      }

      // Otherwise, use compact format with reference to detail file
      return `## ${section.title}

${getFirstSentence(section.content)}

See [@${AGENTS_DOCS_DIR}/${section.detailFile}](${AGENTS_DOCS_DIR}/${section.detailFile}) for detailed information.
`
    })
    .join('\n')

  return (
    header +
    '\n' +
    compactSections +
    `
---

*This AGENTS.md was generated using agent-based project discovery.*
*Detailed information is available in the ${AGENTS_DOCS_DIR}/ directory.*
`
  )
}

/**
 * Extract concise, informative summary from agent-generated content
 * Skips unhelpful preambles like "Based on my analysis..."
 */
function getFirstSentence(content: string): string {
  if (!content) return 'Information not available.'

  // Skip common unhelpful agent preambles - comprehensive list of patterns
  const skipPatterns = [
    /^Based on (?:my |the )?(?:comprehensive |detailed |thorough )?(?:analysis|exploration|examination|review|investigation).*?[:,]\s*/gi,
    /^(?:Here's|Here is).*?(?:analysis|overview|summary|breakdown).*?[:,]\s*/gi,
    /^I(?:'ve|'ll| have| will).*?(?:analyze|explore|examine|review).*?[:,]\s*/gi,
    /^(?:Looking|Examining|Reviewing|Analyzing) (?:at )?(?:the |this )?(?:project|codebase|code).*?[:,]\s*/gi,
    /^After (?:analyzing|examining|reviewing|exploring).*?[:,]\s*/gi,
    /^Let me (?:analyze|explore|examine|review).*?[:,]\s*/gi,
    /^Upon (?:analysis|examination|review|exploration).*?[:,]\s*/gi,
    /^(?:The |This )?(?:analysis|exploration|examination) (?:shows|reveals|indicates).*?[:,]\s*/gi,
  ]

  let cleanContent = content.trim()

  // Remove matching preamble patterns (including following whitespace/newlines)
  for (const pattern of skipPatterns) {
    cleanContent = cleanContent.replace(pattern, '').trim()
  }

  // Look for structured information markers (uppercase patterns)
  const lines = cleanContent.split('\n').filter(line => line.trim())

  // Try to find lines with structured info like "**KEY**: value" or "KEY: value"
  for (const line of lines) {
    const trimmed = line.trim()
    // Match **UPPERCASE**: value or UPPERCASE: value patterns
    if (trimmed.match(/^\*\*[A-Z][A-Z\s_-]+\*\*\s*:|^[A-Z][A-Z\s_-]+:/)) {
      if (trimmed.length <= 150) {
        return trimmed
      }
      // If too long, extract just the key and first part of value
      const colonIndex = trimmed.indexOf(':')
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex + 1)
        const value = trimmed.substring(colonIndex + 1).trim()
        const shortValue = value.split(/[,;]/)[0]?.trim() || value.substring(0, 80)
        return `${key} ${shortValue}`
      }
    }
  }

  // Try to get the first meaningful line that isn't a preamble
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip lines that look like preambles
    if (
      trimmed.toLowerCase().startsWith('based on') ||
      trimmed.toLowerCase().startsWith("here's") ||
      trimmed.toLowerCase().startsWith('here is') ||
      trimmed.toLowerCase().startsWith('i ') ||
      trimmed.toLowerCase().startsWith("i'") ||
      trimmed.toLowerCase().startsWith('the analysis') ||
      trimmed.toLowerCase().startsWith('looking at') ||
      trimmed.toLowerCase().startsWith('after ')
    ) {
      continue
    }
    if (trimmed.length > 0 && trimmed.length <= 150) {
      return trimmed
    }
  }

  // If first line is acceptable, use it
  const firstLine = lines[0]?.trim() ?? ''
  if (firstLine.length > 0 && firstLine.length <= 150) {
    return firstLine
  }

  // If first line is too long, try to get first sentence
  const sentences = cleanContent.split(/[.!?]+/)
  if (sentences.length > 0 && sentences[0]?.trim().length && sentences[0].trim().length <= 150) {
    return sentences[0].trim() + '.'
  }

  // Fallback: truncate to reasonable length
  return cleanContent.substring(0, 150).trim() + '...'
}

/**
 * Generate AGENTS.md content based on agent-based discovery
 */
async function generateContent(
  projectPath: string,
  analysis: ProjectAnalysis,
  config: HoneConfig,
  agent?: AgentType
): Promise<{ mainContent: string; detailSections?: TemplateSection[]; useAgentsDir: boolean }> {
  log('\nPhase 2: Agent Discovery')
  log('-'.repeat(80))

  process.stdout.write('Executing agent-based project discovery... ')

  try {
    // Execute parallel agent scanning for comprehensive project analysis
    const scanResults = await executeParallelScanning(projectPath, config, agent)
    process.stdout.write('✓\n')

    logVerbose(
      `[AgentsMd] Discovery completed with ${Object.keys(scanResults).length} analysis areas`
    )

    log('\nPhase 3: Content Generation')
    log('-'.repeat(80))

    // Create adaptive template sections based on discovered tech stack
    const sections = createTemplateSections(scanResults, analysis, projectPath)

    // Generate initial content to check line count
    const fullContent = generateCompactContent(sections, false)
    const lineCount = countLines(fullContent)

    logVerbose(`[AgentsMd] Generated content has ${lineCount} lines (limit: 100)`)

    // Decide whether to use ${AGENTS_DOCS_DIR}/ subdirectory based on content length and complexity
    const useAgentsDir = lineCount > 100 || sections.length > 5

    if (useAgentsDir) {
      if (lineCount > 100) {
        log(
          `Content exceeds 100-line limit. Creating ${AGENTS_DOCS_DIR}/ subdirectory for detailed information.`
        )
      } else {
        log(
          `Project has complex structure. Creating ${AGENTS_DOCS_DIR}/ subdirectory for better organization.`
        )
      }
    }

    logVerbose(`[AgentsMd] Using ${AGENTS_DOCS_DIR}/ directory: ${useAgentsDir}`)

    const mainContent = generateCompactContent(sections, useAgentsDir)

    return {
      mainContent,
      detailSections: useAgentsDir ? sections : undefined,
      useAgentsDir,
    }
  } catch (error) {
    process.stdout.write('✗\n')
    throw error
  }
}

/**
 * Main function to generate AGENTS.md documentation
 */
export async function generateAgentsMd(
  options: AgentsMdGeneratorOptions = {}
): Promise<GenerationResult> {
  const projectPath = options.projectPath || process.cwd()

  try {
    log('Phase 1: Project Analysis')
    log('-'.repeat(80))

    process.stdout.write('Analyzing project structure... ')
    const analysis = await analyzeProject(projectPath)
    process.stdout.write('✓\n')

    process.stdout.write('Loading configuration... ')
    const config = await loadConfigWithoutCreation()
    process.stdout.write('✓\n')

    logVerbose(
      `[AgentsMd] Found ${analysis.languages.length} languages, ${analysis.buildSystems.length} build systems, ${analysis.testingFrameworks.length} testing frameworks`
    )

    // Check if AGENTS.md already exists and handle accordingly
    const agentsPath = join(projectPath, 'AGENTS.md')
    const existingAgentsDirPath = join(projectPath, AGENTS_DOCS_DIR)

    if (existsSync(agentsPath)) {
      if (!options.overwrite) {
        log('\n• AGENTS.md already exists. Use --overwrite to replace it.')
        return {
          success: false,
          filesCreated: [],
          error: new Error('AGENTS.md already exists'),
        }
      } else {
        log('• AGENTS.md exists. Overwriting with new content.')
      }
    }

    // Also check for existing ${AGENTS_DOCS_DIR}/ directory and inform user
    if (existsSync(existingAgentsDirPath)) {
      if (!options.overwrite) {
        logVerbose(
          `[AgentsMd] ${AGENTS_DOCS_DIR}/ directory already exists. Detail files will be skipped unless --overwrite is used.`
        )
      } else {
        logVerbose(
          `[AgentsMd] ${AGENTS_DOCS_DIR}/ directory exists. Detail files will be overwritten.`
        )
      }
    }

    const { mainContent, detailSections, useAgentsDir } = await generateContent(
      projectPath,
      analysis,
      config,
      options.agent
    )

    log('\nPhase 4: File Generation')
    log('-'.repeat(80))

    process.stdout.write('Writing AGENTS.md file... ')

    // Preserve existing gotchas/learnings if overwriting
    let finalContent = mainContent
    if (options.overwrite && existsSync(agentsPath)) {
      try {
        const existingContent = await readFile(agentsPath, 'utf-8')
        const preservedContent = extractPreservableContent(existingContent)
        if (preservedContent) {
          finalContent = `${mainContent}\n\n<!-- PRESERVED CONTENT FROM PREVIOUS VERSION -->\n${preservedContent}`
          logVerbose('[AgentsMd] Preserved existing gotchas/learnings from previous AGENTS.md')
        }
      } catch (error) {
        logVerboseError(`[AgentsMd] Could not preserve existing content: ${error}`)
      }
    }

    await writeFile(agentsPath, finalContent, 'utf-8')
    process.stdout.write('✓\n')

    const filesCreated = [agentsPath]

    // Create ${AGENTS_DOCS_DIR}/ directory and detail files if needed
    let agentsDirPath: string | undefined
    let detailFilesCreated = 0

    if (useAgentsDir && detailSections) {
      agentsDirPath = join(projectPath, AGENTS_DOCS_DIR)

      // Handle existing ${AGENTS_DOCS_DIR}/ directory
      if (existsSync(agentsDirPath)) {
        if (!options.overwrite) {
          log(
            `• ${AGENTS_DOCS_DIR}/ directory already exists. Use --overwrite to replace existing detail files.`
          )
        } else {
          log(`• ${AGENTS_DOCS_DIR}/ directory exists. Overwriting existing detail files.`)
        }
      } else {
        await mkdir(agentsDirPath, { recursive: true })
        logVerbose(`[AgentsMd] Created ${AGENTS_DOCS_DIR}/ directory for detailed information`)
      }

      process.stdout.write(`Creating ${detailSections.length} detail files... `)

      // Write detail files
      for (const section of detailSections) {
        if (section.detailFile) {
          const detailPath = join(agentsDirPath, section.detailFile)

          // Check if detail file already exists
          if (existsSync(detailPath) && !options.overwrite) {
            logVerbose(`[AgentsMd] Skipping existing detail file: ${section.detailFile}`)
            continue
          }

          try {
            const detailContent = `# ${section.title}

${section.content}

---

*This file is part of the AGENTS.md documentation system.*
`
            await writeFile(detailPath, detailContent, 'utf-8')
            filesCreated.push(detailPath)
            detailFilesCreated++
            logVerbose(
              `[AgentsMd] ${existsSync(detailPath) && options.overwrite ? 'Updated' : 'Created'} detail file: ${section.detailFile}`
            )
          } catch (fileError) {
            logVerboseError(
              `[AgentsMd] Failed to write detail file ${section.detailFile}: ${fileError instanceof Error ? fileError.message : fileError}`
            )
            // Continue with other files rather than failing completely
          }
        }
      }

      process.stdout.write('✓\n')
    }

    // Success message with details
    log('')
    if (useAgentsDir && detailSections) {
      log(`✓ Generated AGENTS.md with ${detailSections.length} sections`)
      log(`✓ Created ${detailFilesCreated} detail files in ${AGENTS_DOCS_DIR}/`)
    } else {
      log(
        `✓ Generated AGENTS.md with ${analysis.languages.length + analysis.buildSystems.length + analysis.testingFrameworks.length} detected components`
      )
    }

    // Next steps guidance
    log('')
    log('Next steps:')
    log('  1. Review the generated AGENTS.md for accuracy')
    if (useAgentsDir) {
      log(`  2. Check detailed information in the ${AGENTS_DOCS_DIR}/ directory`)
    }
    log('  3. Edit and customize the documentation as needed')
    log('  4. Commit the changes to your repository')

    return {
      success: true,
      mainFilePath: agentsPath,
      agentsDirPath,
      filesCreated,
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logError('\n✗ Failed to generate AGENTS.md')
    logError(`Error: ${err.message}`)

    return {
      success: false,
      filesCreated: [],
      error: err,
    }
  }
}
