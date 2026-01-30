/**
 * AGENTS.md generation functionality
 * Core module for generating project documentation for AI agents
 */

import { loadConfig, resolveModelForPhase } from './config'
import type { AgentType } from './config'
import { readFile, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { exitWithError } from './errors'
import { AgentClient } from './agent-client'
import { log, logError, logVerbose } from './logger'

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
 * Generate AGENTS.md content based on project analysis
 */
async function generateContent(
  projectPath: string,
  analysis: ProjectAnalysis,
  config: any
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
