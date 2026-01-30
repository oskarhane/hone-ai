/**
 * AGENTS.md generation functionality
 * Core module for generating project documentation for AI agents
 */

import { loadConfig, resolveModelForPhase, type HoneConfig } from './config'
import { readFile, writeFile } from 'fs/promises'
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

    logVerbose(`Project analysis complete: ${JSON.stringify(analysis, null, 2)}`)
    return analysis
  } catch (error) {
    logError(`Error analyzing project: ${error instanceof Error ? error.message : error}`)
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

  logVerbose(`[AgentClient] Executing ${promptKey} discovery prompt`)

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

    logVerbose(`[AgentClient] Completed ${promptKey} discovery: ${result.substring(0, 100)}...`)
    return result
  } catch (error) {
    logVerboseError(
      `[AgentClient] Failed ${promptKey} discovery: ${error instanceof Error ? error.message : error}`
    )
    return `Error analyzing ${promptKey}: ${error instanceof Error ? error.message : error}`
  }
}

/**
 * Generate AGENTS.md content based on project analysis
 */
async function generateContent(
  projectPath: string,
  analysis: ProjectAnalysis,
  config: HoneConfig
): Promise<string> {
  // This is a placeholder for the actual content generation logic
  // Will be implemented in future tasks using agent-based discovery

  const content = `# AGENTS.md

Learnings and patterns for future agents working on this project.

## Project Overview

This project uses the following technologies:
- Languages: ${analysis.languages.join(', ') || 'Not detected'}
- Build Systems: ${analysis.buildSystems.join(', ') || 'Not detected'}
- Testing Frameworks: ${analysis.testingFrameworks.join(', ') || 'Not detected'}
- Dependencies: ${analysis.dependencies.join(', ') || 'Not detected'}
- Architecture Patterns: ${analysis.architecture.join(', ') || 'Not detected'}

## Build System

[To be populated by agent-based discovery]

## Testing Framework

[To be populated by agent-based discovery]

## Deployment

[To be populated by agent-based discovery]

## Architecture Notes

[To be populated by agent-based discovery]
`

  return content
}

/**
 * Main function to generate AGENTS.md documentation
 */
export async function generateAgentsMd(
  options: AgentsMdGeneratorOptions = {}
): Promise<GenerationResult> {
  const projectPath = options.projectPath || process.cwd()

  try {
    log('Analyzing project structure...')
    const analysis = await analyzeProject(projectPath)

    log('Loading configuration...')
    const config = await loadConfig()

    // Check if AGENTS.md already exists
    const agentsPath = join(projectPath, 'AGENTS.md')
    if (existsSync(agentsPath) && !options.overwrite) {
      log('AGENTS.md already exists. Use --overwrite to replace it.')
      return {
        success: false,
        filesCreated: [],
        error: new Error('AGENTS.md already exists'),
      }
    }

    log('Generating AGENTS.md content...')
    const content = await generateContent(projectPath, analysis, config)

    log('Writing AGENTS.md file...')
    await writeFile(agentsPath, content, 'utf-8')

    log('✓ AGENTS.md generated successfully')

    return {
      success: true,
      mainFilePath: agentsPath,
      filesCreated: [agentsPath],
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logError(`Failed to generate AGENTS.md: ${err.message}`)

    return {
      success: false,
      filesCreated: [],
      error: err,
    }
  }
}
