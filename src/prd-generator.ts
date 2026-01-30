import { loadConfig, resolveModelForPhase } from './config'
import { readFile, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import * as readline from 'readline'
import { exitWithError, ErrorMessages } from './errors'
import { AgentClient } from './agent-client'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

async function analyzeCodebase(): Promise<string> {
  const analysis: string[] = []
  const projectRoot = process.cwd()

  // Package.json analysis
  if (existsSync(join(projectRoot, 'package.json'))) {
    const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'))
    analysis.push(`Project: ${pkg.name || 'unnamed'}`)
    if (pkg.description) analysis.push(`Description: ${pkg.description}`)

    if (pkg.dependencies) {
      const deps = Object.keys(pkg.dependencies)
      if (deps.includes('react')) analysis.push('Framework: React')
      if (deps.includes('next')) analysis.push('Framework: Next.js')
      if (deps.includes('vue')) analysis.push('Framework: Vue')
      if (deps.includes('typescript')) analysis.push('Language: TypeScript')
      if (deps.includes('commander')) analysis.push('CLI: commander.js')
      if (deps.includes('express')) analysis.push('Backend: Express')
      if (deps.includes('fastify')) analysis.push('Backend: Fastify')

      // Testing frameworks
      if (deps.includes('jest') || pkg.devDependencies?.jest) analysis.push('Testing: Jest')
      if (deps.includes('vitest') || pkg.devDependencies?.vitest) analysis.push('Testing: Vitest')
      if (deps.includes('mocha') || pkg.devDependencies?.mocha) analysis.push('Testing: Mocha')
    }

    if (pkg.scripts) {
      const scripts = Object.keys(pkg.scripts)
      if (scripts.includes('build')) analysis.push('Build: Configured')
      if (scripts.includes('test')) analysis.push('Test script: Available')
      if (scripts.includes('lint')) analysis.push('Linting: Available')
      if (scripts.includes('dev') || scripts.includes('start'))
        analysis.push('Dev server: Available')
    }
  }

  // Directory structure analysis
  const srcExists = existsSync(join(projectRoot, 'src'))
  const componentsExists =
    existsSync(join(projectRoot, 'src/components')) || existsSync(join(projectRoot, 'components'))
  const libExists = existsSync(join(projectRoot, 'lib')) || existsSync(join(projectRoot, 'src/lib'))
  const utilsExists =
    existsSync(join(projectRoot, 'utils')) || existsSync(join(projectRoot, 'src/utils'))

  if (srcExists) analysis.push('Structure: src/ directory')
  if (componentsExists) analysis.push('Has: Components directory')
  if (libExists) analysis.push('Has: Lib directory')
  if (utilsExists) analysis.push('Has: Utils directory')

  // Configuration files
  const configs = [
    { file: 'tsconfig.json', desc: 'TypeScript config' },
    { file: 'jest.config.js', desc: 'Jest config' },
    { file: 'vitest.config.ts', desc: 'Vitest config' },
    { file: '.eslintrc', desc: 'ESLint config' },
    { file: 'tailwind.config.js', desc: 'Tailwind config' },
    { file: 'next.config.js', desc: 'Next.js config' },
    { file: 'vite.config.ts', desc: 'Vite config' },
    { file: 'docker-compose.yml', desc: 'Docker Compose' },
    { file: 'Dockerfile', desc: 'Docker' },
  ]

  for (const config of configs) {
    if (existsSync(join(projectRoot, config.file))) {
      analysis.push(`Config: ${config.desc}`)
    }
  }

  // Check for specific project patterns
  if (existsSync(join(projectRoot, '.plans'))) {
    analysis.push('Project type: Uses hone for task management')
  }

  if (existsSync(join(projectRoot, 'AGENTS.md'))) {
    analysis.push('Documentation: Has AGENTS.md (development guidelines)')
  }

  // README analysis
  if (existsSync(join(projectRoot, 'README.md'))) {
    try {
      const readme = await readFile(join(projectRoot, 'README.md'), 'utf-8')
      const hasInstallSection = readme.toLowerCase().includes('install')
      const hasUsageSection = readme.toLowerCase().includes('usage')
      if (hasInstallSection) analysis.push('README: Has installation instructions')
      if (hasUsageSection) analysis.push('README: Has usage instructions')
    } catch {
      // Ignore errors reading README
    }
  }

  // Check for common patterns in source files
  if (srcExists) {
    try {
      const srcFiles = await readdir(join(projectRoot, 'src'))
      if (srcFiles.includes('index.ts') || srcFiles.includes('index.js')) {
        analysis.push('Entry point: src/index')
      }
      if (srcFiles.includes('cli.ts') || srcFiles.includes('cli.js')) {
        analysis.push('Has: CLI module')
      }
      if (srcFiles.includes('config.ts') || srcFiles.includes('config.js')) {
        analysis.push('Has: Configuration module')
      }
      if (srcFiles.some(f => f.includes('test'))) {
        analysis.push('Testing: Test files in src')
      }
    } catch {
      // Ignore errors reading src directory
    }
  }

  return analysis.length > 0 ? analysis.join(', ') : 'No specific patterns detected'
}

interface QAResponse {
  question: string | null
  shouldContinue: boolean
}

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

async function generateClarifyingQuestion(
  featureDescription: string,
  codebaseAnalysis: string,
  previousQA: Array<{ question: string; answer: string }>,
  roundNumber: number
): Promise<QAResponse> {
  const config = await loadConfig()
  const model = resolveModelForPhase(config, 'prd')

  const client = new AgentClient({
    agent: config.defaultAgent,
    model,
  })

  // Show progress indicator for question generation
  process.stdout.write(`Generating question ${roundNumber}... `)

  const qaHistory = previousQA.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')

  // Read AGENTS.md for context about the project
  let agentsContent = ''
  const agentsPath = join(process.cwd(), 'AGENTS.md')
  if (existsSync(agentsPath)) {
    try {
      agentsContent = await readFile(agentsPath, 'utf-8')
    } catch {
      // Ignore errors reading AGENTS.md
    }
  }

  const systemPrompt = `You are helping generate a Product Requirements Document (PRD) for a software feature.
The user has provided a feature description, and you need to ask clarifying questions to make the PRD comprehensive.

IMPORTANT: Before asking questions, carefully analyze the provided codebase context and project documentation.
Many common questions about testing frameworks, build systems, dependencies, project structure, and technical
patterns can be answered from the codebase analysis. Only ask questions that cannot be determined from the code.

FILE AND URL PROCESSING:
- If the feature description contains file paths (e.g., "./file.txt", "/path/to/file", "src/component.js"), automatically read and incorporate their content using the Read tool
- If the feature description contains URLs (e.g., "https://example.com", "http://site.com/page"), automatically fetch and incorporate their content using the WebFetch tool
- Process these references transparently - no need to ask the user about them unless you cannot access them
- REFERENCE ACCESS FAILURES: When file reads or URL fetches fail:
  * Continue with question generation using available context
  * Ask clarifying questions about the inaccessible reference's intended purpose or relevance
  * Examples: "I couldn't access [file/URL]. What was its relevance to this feature?" or "Since [reference] is inaccessible, could you clarify what information it contained that's relevant to the requirements?"
  * Prioritize these clarification questions early in the Q&A session when references are critical to understanding scope
- Use the content from files and URLs to better inform your clarifying questions when accessible

Rules:
- Ask ONE specific, focused question at a time
- Questions should help clarify requirements, scope, UX, technical approach, or edge cases
- Keep questions concise
- If you have enough information to write a good PRD, respond with "DONE" instead of a question
- You are on round ${roundNumber} of maximum 5 rounds
- AVOID asking questions that can be answered from the codebase analysis below

Codebase context: ${codebaseAnalysis}

${
  agentsContent
    ? `Project documentation (AGENTS.md):
${agentsContent}

`
    : ''
}Feature description: ${featureDescription}

${qaHistory ? `Previous Q&A:\n${qaHistory}` : 'This is the first question.'}`

  try {
    const response = await client.messages.create({
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content:
            'What is your next clarifying question, or respond with "DONE" if you have enough information?',
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

async function generatePRDContent(
  featureDescription: string,
  codebaseAnalysis: string,
  qa: Array<{ question: string; answer: string }>
): Promise<{ content: string; featureName: string }> {
  const config = await loadConfig()
  const model = resolveModelForPhase(config, 'prd')

  const client = new AgentClient({
    agent: config.defaultAgent,
    model,
  })

  // Show progress indicator for PRD generation
  process.stdout.write('Writing PRD document... ')

  const qaHistory = qa.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')

  // Read AGENTS.md for context about the project
  let agentsContent = ''
  const agentsPath = join(process.cwd(), 'AGENTS.md')
  if (existsSync(agentsPath)) {
    try {
      agentsContent = await readFile(agentsPath, 'utf-8')
    } catch {
      // Ignore errors reading AGENTS.md
    }
  }

  const systemPrompt = `You are a technical product manager writing a Product Requirements Document (PRD).

FILE AND URL PROCESSING:
- If the feature description contains file paths (e.g., "./file.txt", "/path/to/file", "src/component.js"), automatically read and incorporate their content using the Read tool
- If the feature description contains URLs (e.g., "https://example.com", "http://site.com/page"), automatically fetch and incorporate their content using the WebFetch tool
- Process these references transparently to enrich the PRD content with actual file contents and web page information
- If references fail to load, note them in the "Open Questions" section and continue PRD generation
- Use the content from files and URLs to inform technical decisions, requirements, and acceptance criteria

Generate a comprehensive PRD with the following structure:

# PRD: <Feature Name>

## Overview
Brief description of the feature and its purpose.

## Goals
What this feature aims to achieve.

## Non-Goals
What is explicitly out of scope.

## Requirements

### Functional Requirements
- REQ-F-001: ...
- REQ-F-002: ...

### Non-Functional Requirements
- REQ-NF-001: ...

## Technical Considerations
Architecture decisions, integration points, potential challenges.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
Items explicitly not included in this feature.

## Open Questions
Any unresolved questions.

Context:
- Codebase: ${codebaseAnalysis}
- Feature: ${featureDescription}
${agentsContent ? `\n- Project Documentation (AGENTS.md):\n${agentsContent}` : ''}${qaHistory ? `\n- Q&A Session:\n${qaHistory}` : ''}

Write a complete, detailed PRD following the structure above. Use the codebase analysis and project
documentation to inform technical decisions and ensure the PRD aligns with the existing project patterns.`

  try {
    const response = await client.messages.create({
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: 'Generate the PRD now.',
        },
      ],
      system: systemPrompt,
    })

    const content = response.content[0]
    const prdContent = content && content.type === 'text' ? content.text : ''

    if (!prdContent.trim()) {
      throw new Error('Agent returned empty PRD content')
    }

    // Extract feature name from the first heading
    const match = prdContent.match(/# PRD: (.+)/)
    const featureName = match && match[1] ? match[1].trim() : featureDescription

    // Clear progress indicator
    process.stdout.write('✓\n')

    return { content: prdContent, featureName }
  } catch (error) {
    // Clear progress indicator with error
    process.stdout.write('✗\n')

    // Re-throw the error to be handled by the caller
    // This allows the generatePRD function to implement fallback behavior
    throw error
  }
}

export async function generatePRD(featureDescription: string): Promise<string> {
  console.log('\nAnalyzing codebase...')
  const codebaseAnalysis = await analyzeCodebase()
  console.log(`Found: ${codebaseAnalysis}\n`)

  const qa: Array<{ question: string; answer: string }> = []
  const maxRounds = 5

  console.log('I have a few questions to refine this PRD:\n')

  for (let round = 1; round <= maxRounds; round++) {
    try {
      const { question, shouldContinue } = await generateClarifyingQuestion(
        featureDescription,
        codebaseAnalysis,
        qa,
        round
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

  console.log('\nGenerating PRD...')
  try {
    const { content, featureName } = await generatePRDContent(
      featureDescription,
      codebaseAnalysis,
      qa
    )

    const slug = slugify(featureName)
    const filename = `prd-${slug}.md`
    const filepath = join(process.cwd(), '.plans', filename)

    await writeFile(filepath, content, 'utf-8')

    console.log(`✓ Saved to .plans/${filename}\n`)
    console.log(
      `Review and edit if needed the PRD and then execute "hone prd-to-tasks .plans/${filename}"\n`
    )

    return filename
  } catch (error) {
    console.error(
      `\nError generating PRD: ${error instanceof Error ? error.message : String(error)}`
    )
    console.log('Generating fallback PRD with available information...\n')

    // Generate a fallback PRD with basic structure and available context
    const fallbackFeatureName = featureDescription.split('\n')[0] || 'New Feature'
    const slug = slugify(fallbackFeatureName)
    const filename = `prd-${slug}.md`
    const filepath = join(process.cwd(), '.plans', filename)

    const qaHistory = qa.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')

    const fallbackContent = `# PRD: ${fallbackFeatureName}

## Overview
${featureDescription}

## Goals
To be determined based on further analysis.

## Non-Goals
To be determined based on further analysis.

## Requirements

### Functional Requirements
- REQ-F-001: To be defined based on detailed analysis

### Non-Functional Requirements
- REQ-NF-001: To be defined based on detailed analysis

## Technical Considerations
Based on codebase analysis: ${codebaseAnalysis}

## Acceptance Criteria
- [ ] Requirements to be defined after successful agent processing

## Out of Scope
To be determined.

## Open Questions
- This PRD was generated in fallback mode due to agent processing issues
- Full requirements analysis could not be completed
- Consider regenerating this PRD when system connectivity is restored
${qaHistory ? `\n\nPrevious Q&A Session:\n${qaHistory}` : ''}`

    await writeFile(filepath, fallbackContent, 'utf-8')

    console.log(`✓ Generated fallback PRD: .plans/${filename}`)
    console.log(
      'Note: This PRD contains basic structure. Consider regenerating when system is available.\n'
    )
    console.log(`Review and edit the PRD and then execute "hone prd-to-tasks .plans/${filename}"\n`)

    return filename
  }
}
