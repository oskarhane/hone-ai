/**
 * AGENTS.md generation functionality
 * Core module for generating project documentation for AI agents
 */

import { loadConfig, resolveModelForPhase, type HoneConfig } from './config'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { AgentClient } from './agent-client'
import { log, logError, logVerbose, logVerboseError } from './logger'

export interface AgentsMdGeneratorOptions {
  projectPath?: string
  overwrite?: boolean
}

export interface ProjectAnalysis {
  languages: string[]
  buildSystems: string[]
  testingFrameworks: string[]
  dependencies: string[]
  architecture: string[]
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
  }

  try {
    // Package.json analysis for Node.js projects
    const pkgPath = join(projectPath, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))

        // Detect languages based on dependencies
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
        if (allDeps.typescript || existsSync(join(projectPath, 'tsconfig.json'))) {
          analysis.languages.push('TypeScript')
        } else {
          analysis.languages.push('JavaScript')
        }

        // Detect frameworks and build systems
        if (allDeps.react) analysis.dependencies.push('React')
        if (allDeps.next) analysis.dependencies.push('Next.js')
        if (allDeps.vue) analysis.dependencies.push('Vue.js')
        if (allDeps.express) analysis.dependencies.push('Express')
        if (allDeps.fastify) analysis.dependencies.push('Fastify')
        if (allDeps['commander'] || allDeps['commander.js'])
          analysis.dependencies.push('Commander.js')

        // Build systems
        if (pkg.scripts?.build) analysis.buildSystems.push('npm scripts')
        if (existsSync(join(projectPath, 'webpack.config.js')))
          analysis.buildSystems.push('Webpack')
        if (
          existsSync(join(projectPath, 'vite.config.ts')) ||
          existsSync(join(projectPath, 'vite.config.js'))
        ) {
          analysis.buildSystems.push('Vite')
        }

        // Testing frameworks
        if (allDeps.jest) analysis.testingFrameworks.push('Jest')
        if (allDeps.vitest) analysis.testingFrameworks.push('Vitest')
        if (allDeps.mocha) analysis.testingFrameworks.push('Mocha')
        if (allDeps.bun) {
          analysis.testingFrameworks.push('Bun Test')
          analysis.buildSystems.push('Bun')
        }
      } catch (error) {
        logVerbose(`Could not parse package.json: ${error}`)
      }
    }

    // Python project detection
    if (
      existsSync(join(projectPath, 'requirements.txt')) ||
      existsSync(join(projectPath, 'pyproject.toml')) ||
      existsSync(join(projectPath, 'setup.py'))
    ) {
      analysis.languages.push('Python')

      if (existsSync(join(projectPath, 'pyproject.toml'))) {
        analysis.buildSystems.push('Poetry/setuptools')
      }
    }

    // Java project detection
    if (existsSync(join(projectPath, 'pom.xml'))) {
      analysis.languages.push('Java')
      analysis.buildSystems.push('Maven')
    }
    if (
      existsSync(join(projectPath, 'build.gradle')) ||
      existsSync(join(projectPath, 'build.gradle.kts'))
    ) {
      analysis.languages.push('Java/Kotlin')
      analysis.buildSystems.push('Gradle')
    }

    // Go project detection
    if (existsSync(join(projectPath, 'go.mod'))) {
      analysis.languages.push('Go')
      analysis.buildSystems.push('Go modules')
    }

    // Rust project detection
    if (existsSync(join(projectPath, 'Cargo.toml'))) {
      analysis.languages.push('Rust')
      analysis.buildSystems.push('Cargo')
    }

    // Architecture patterns
    if (existsSync(join(projectPath, 'src'))) {
      analysis.architecture.push('src/ directory structure')
    }
    if (existsSync(join(projectPath, 'docker-compose.yml'))) {
      analysis.architecture.push('Docker Compose')
    }
    if (existsSync(join(projectPath, 'Dockerfile'))) {
      analysis.architecture.push('Docker containerization')
    }
    if (existsSync(join(projectPath, '.github/workflows'))) {
      analysis.architecture.push('GitHub Actions CI/CD')
    }

    logVerbose(`[AgentsMd] Project analysis complete: ${JSON.stringify(analysis, null, 2)}`)
    return analysis
  } catch (error) {
    logVerboseError(
      `[AgentsMd] Error analyzing project: ${error instanceof Error ? error.message : error}`
    )
    return analysis // Return partial analysis on error
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

Respond with a concise summary in this format:
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

Respond with:
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

Respond with:
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

Respond with:
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

Respond with:
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
  config: HoneConfig
): Promise<string> {
  const model = resolveModelForPhase(config, 'implement') // Use implement phase model
  const client = new AgentClient({
    agent: config.defaultAgent,
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
  config: HoneConfig
): Promise<Record<keyof typeof DISCOVERY_PROMPTS, string>> {
  const promptKeys = Object.keys(DISCOVERY_PROMPTS) as (keyof typeof DISCOVERY_PROMPTS)[]

  logVerbose(`[AgentsMd] Starting parallel scanning with ${promptKeys.length} discovery prompts`)

  // Execute all discovery prompts in parallel to stay within 90-second limit
  const results = await Promise.all(
    promptKeys.map(async key => ({
      key,
      result: await executeDiscoveryPrompt(projectPath, key, config),
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
 * Create adaptive template sections based on discovered tech stack
 */
function createTemplateSections(
  scanResults: Record<keyof typeof DISCOVERY_PROMPTS, string>,
  analysis: ProjectAnalysis
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
  const deploymentContent = scanResults.deployment || ''
  if (deploymentContent && !deploymentContent.includes('not available')) {
    sections.push({
      title: 'Deployment',
      content: deploymentContent,
      priority: 5,
      detailFile: 'deployment.md',
    })
  }

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

  // Compact version with references to .agents/ files
  const compactSections = sections
    .map(
      section => `## ${section.title}

${getFirstSentence(section.content)}

See [@.agents/${section.detailFile}](.agents/${section.detailFile}) for detailed information.
`
    )
    .join('\n')

  return (
    header +
    '\n' +
    compactSections +
    `
---

*This AGENTS.md was generated using agent-based project discovery.*
*Detailed information is available in the .agents/ directory.*
`
  )
}

/**
 * Extract concise, informative summary from agent-generated content
 * Skips unhelpful preambles like "Based on my analysis..."
 */
function getFirstSentence(content: string): string {
  if (!content) return 'Information not available.'

  // Skip common unhelpful agent preambles
  const skipPatterns = [
    /^Based on my analysis.*?here's.*?:\s*/i,
    /^Based on my architectural analysis.*?:\s*/i,
    /^Based on my exploration.*?:\s*/i,
    /^Here's.*?analysis.*?:\s*/i,
    /^I'll analyze.*?:\s*/i,
    /^Looking at.*?here's.*?:\s*/i,
    /^After analyzing.*?:\s*/i,
  ]

  let cleanContent = content.trim()

  // Remove matching preamble patterns (including following whitespace/newlines)
  for (const pattern of skipPatterns) {
    cleanContent = cleanContent.replace(pattern, '').trim()
  }

  // Look for structured information markers (uppercase patterns)
  const lines = cleanContent.split('\n').filter(line => line.trim())

  // Try to find lines with structured info like "**FRAMEWORK**: value" or "LANGUAGES: value"
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.match(/^\*\*[A-Z][A-Z\s]+\*\*:|^[A-Z][A-Z\s]+:/)) {
      if (trimmed.length <= 120) {
        return trimmed
      }
    }
  }

  // Try to get the first meaningful sentence or line
  const firstLine = lines[0]?.trim() ?? ''
  if (firstLine.length > 0 && firstLine.length <= 120) {
    return firstLine
  }

  // If first line is too long, try to get first sentence
  const sentences = cleanContent.split(/[.!?]+/)
  if (sentences.length > 0 && sentences[0]?.trim().length && sentences[0].trim().length <= 120) {
    return sentences[0].trim() + '.'
  }

  // Fallback: truncate to reasonable length
  return cleanContent.substring(0, 120).trim() + '...'
}

/**
 * Generate AGENTS.md content based on agent-based discovery
 */
async function generateContent(
  projectPath: string,
  analysis: ProjectAnalysis,
  config: HoneConfig
): Promise<{ mainContent: string; detailSections?: TemplateSection[]; useAgentsDir: boolean }> {
  log('\nPhase 2: Agent Discovery')
  log('-'.repeat(80))

  process.stdout.write('Executing agent-based project discovery... ')

  try {
    // Execute parallel agent scanning for comprehensive project analysis
    const scanResults = await executeParallelScanning(projectPath, config)
    process.stdout.write('✓\n')

    logVerbose(
      `[AgentsMd] Discovery completed with ${Object.keys(scanResults).length} analysis areas`
    )

    log('\nPhase 3: Content Generation')
    log('-'.repeat(80))

    // Create adaptive template sections based on discovered tech stack
    const sections = createTemplateSections(scanResults, analysis)

    // Generate initial content to check line count
    const fullContent = generateCompactContent(sections, false)
    const lineCount = countLines(fullContent)

    logVerbose(`[AgentsMd] Generated content has ${lineCount} lines (limit: 100)`)

    // Decide whether to use .agents/ subdirectory based on content length and complexity
    const useAgentsDir = lineCount > 100 || sections.length > 5

    if (useAgentsDir) {
      if (lineCount > 100) {
        log(
          'Content exceeds 100-line limit. Creating .agents/ subdirectory for detailed information.'
        )
      } else {
        log(
          'Project has complex structure. Creating .agents/ subdirectory for better organization.'
        )
      }
    }

    logVerbose(`[AgentsMd] Using .agents/ directory: ${useAgentsDir}`)

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
    const config = await loadConfig()
    process.stdout.write('✓\n')

    logVerbose(
      `[AgentsMd] Found ${analysis.languages.length} languages, ${analysis.buildSystems.length} build systems, ${analysis.testingFrameworks.length} testing frameworks`
    )

    // Check if AGENTS.md already exists and handle accordingly
    const agentsPath = join(projectPath, 'AGENTS.md')
    const existingAgentsDirPath = join(projectPath, '.agents')

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

    // Also check for existing .agents/ directory and inform user
    if (existsSync(existingAgentsDirPath)) {
      if (!options.overwrite) {
        logVerbose(
          '[AgentsMd] .agents/ directory already exists. Detail files will be skipped unless --overwrite is used.'
        )
      } else {
        logVerbose('[AgentsMd] .agents/ directory exists. Detail files will be overwritten.')
      }
    }

    const { mainContent, detailSections, useAgentsDir } = await generateContent(
      projectPath,
      analysis,
      config
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

    // Create .agents/ directory and detail files if needed
    let agentsDirPath: string | undefined
    let detailFilesCreated = 0

    if (useAgentsDir && detailSections) {
      agentsDirPath = join(projectPath, '.agents')

      // Handle existing .agents/ directory
      if (existsSync(agentsDirPath)) {
        if (!options.overwrite) {
          log(
            '• .agents/ directory already exists. Use --overwrite to replace existing detail files.'
          )
        } else {
          log('• .agents/ directory exists. Overwriting existing detail files.')
        }
      } else {
        await mkdir(agentsDirPath, { recursive: true })
        logVerbose('[AgentsMd] Created .agents/ directory for detailed information')
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
      log(`✓ Created ${detailFilesCreated} detail files in .agents/`)
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
      log('  2. Check detailed information in the .agents/ directory')
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
