import { loadConfig, resolveModelForPhase } from './config'
import { readFile, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { exitWithError, ErrorMessages } from './errors'
import { AgentClient } from './agent-client'

interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  dependencies: string[]
  acceptance_criteria: string[]
  completed_at: string | null
}

interface TasksFile {
  feature: string
  prd: string
  created_at: string
  updated_at: string
  tasks: Task[]
}

export async function generateTasksFromPRD(prdFilePath: string): Promise<string> {
  // Validate PRD file exists
  if (!existsSync(prdFilePath)) {
    const { message, details } = ErrorMessages.FILE_NOT_FOUND(prdFilePath)
    exitWithError(message, details)
  }

  // Read PRD content
  const prdContent = await readFile(prdFilePath, 'utf-8')

  // Extract feature name from PRD filename (prd-feature-name.md -> feature-name)
  const prdFilename = basename(prdFilePath)
  const featureMatch = prdFilename.match(/^prd-(.+)\.md$/)
  if (!featureMatch || !featureMatch[1]) {
    throw new Error(`Invalid PRD filename format: ${prdFilename}. Expected: prd-<feature-name>.md`)
  }
  const featureName = featureMatch[1]

  console.log('\nAnalyzing PRD and generating tasks...')

  const tasks = await generateTasksWithAI(prdContent)

  // Create tasks file
  const now = new Date().toISOString()
  const tasksFile: TasksFile = {
    feature: featureName,
    prd: `./${prdFilename}`,
    created_at: now,
    updated_at: now,
    tasks,
  }

  // Convert to YAML format
  const yamlContent = formatAsYAML(tasksFile)

  // Save to .plans/tasks-<feature-name>.yml
  const tasksFilename = `tasks-${featureName}.yml`
  const tasksFilePath = join(process.cwd(), '.plans', tasksFilename)

  await writeFile(tasksFilePath, yamlContent, 'utf-8')

  console.log(`✓ Generated ${tasks.length} tasks`)
  console.log(`✓ Saved to .plans/${tasksFilename}\n`)
  console.log(
    `Now run "hone run .plans/${tasksFilename} -i ${tasks.length}" to execute the tasks\n`
  )

  return tasksFilename
}

async function generateTasksWithAI(prdContent: string): Promise<Task[]> {
  const config = await loadConfig()
  const model = resolveModelForPhase(config, 'prdToTasks')

  const client = new AgentClient({
    agent: config.defaultAgent,
    model,
  })

  const systemPrompt = `You are a technical project manager breaking down a PRD into implementable tasks.

Generate an ordered list of tasks following these guidelines:

1. **Task Structure**: Each task must have:
   - id: Unique identifier (task-001, task-002, etc.)
   - title: Brief, actionable title (max 80 chars)
   - description: Detailed description of what needs to be done (2-4 sentences)
   - status: Always "pending" for new tasks
   - dependencies: Array of task IDs that must complete first (empty array if none)
   - acceptance_criteria: Array of specific, testable criteria (3-5 items)
   - completed_at: Always null for new tasks

2. **Task Ordering**: Order tasks by priority:
   - Dependencies and infrastructure first
   - Core abstractions and architectural decisions
   - Integration points between modules
   - Standard features
   - Polish and refinements

3. **Dependencies**:
   - Identify which tasks must complete before others
   - Use task IDs in dependencies array
   - Keep dependency chains reasonable (don't over-constrain)

4. **Output Format**: Return ONLY a JSON array of tasks, no other text.

Example output:
[
  {
    "id": "task-001",
    "title": "Setup project structure",
    "description": "Initialize project with necessary directories and config files. Set up build tooling and basic CLI framework.",
    "status": "pending",
    "dependencies": [],
    "acceptance_criteria": [
      "Project initializes successfully",
      "Basic CLI responds to --help",
      "Build process configured"
    ],
    "completed_at": null
  },
  {
    "id": "task-002",
    "title": "Implement core API client",
    "description": "Create API client with authentication, error handling, and retry logic. Should support all required endpoints.",
    "status": "pending",
    "dependencies": ["task-001"],
    "acceptance_criteria": [
      "Client authenticates successfully",
      "All endpoints accessible",
      "Error handling tested"
    ],
    "completed_at": null
  }
]

Now analyze this PRD and generate tasks:`

  try {
    const response = await client.messages.create({
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: prdContent,
        },
      ],
      system: systemPrompt,
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new Error('Invalid response from AI')
    }

    // Extract JSON array from response (handle cases where AI wraps in markdown code blocks)
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

      // Validate task structure
      for (const task of tasks) {
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
      }

      return tasks
    } catch (error) {
      throw new Error(
        `Failed to parse AI response as JSON: ${error instanceof Error ? error.message : error}`
      )
    }
  } catch (error) {
    const { message, details } = ErrorMessages.NETWORK_ERROR_FINAL(error)
    exitWithError(message, details)
    throw error // Never reached but satisfies TypeScript
  }
}

function formatAsYAML(tasksFile: TasksFile): string {
  const lines: string[] = []

  lines.push(`feature: ${tasksFile.feature}`)
  lines.push(`prd: ${tasksFile.prd}`)
  lines.push(`created_at: ${tasksFile.created_at}`)
  lines.push(`updated_at: ${tasksFile.updated_at}`)
  lines.push('')
  lines.push('tasks:')

  for (const task of tasksFile.tasks) {
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
    if (task.dependencies.length === 0) {
      lines.push(`    dependencies: []`)
    } else {
      lines.push(`    dependencies:`)
      for (const dep of task.dependencies) {
        lines.push(`      - ${dep}`)
      }
    }

    // Acceptance criteria
    lines.push(`    acceptance_criteria:`)
    for (const criterion of task.acceptance_criteria) {
      lines.push(`      - "${criterion}"`)
    }

    lines.push(`    completed_at: ${task.completed_at || 'null'}`)
    lines.push('')
  }

  return lines.join('\n')
}
