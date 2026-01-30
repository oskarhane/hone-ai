import { existsSync } from 'fs'
import { join, relative } from 'path'
import { getPlansDir, type HoneConfig } from './config'

export type PromptPhase = 'implement' | 'review' | 'finalize'

export interface PromptOptions {
  phase: PromptPhase
  featureName: string
  config: HoneConfig
  taskId?: string
  reviewFeedback?: string
}

/**
 * Construct a structured prompt for agent invocations.
 * References files using @<path> syntax instead of embedding content.
 */
export function constructPrompt(options: PromptOptions): string {
  const { phase, featureName, config, taskId, reviewFeedback } = options

  const parts: string[] = []

  // Build list of file references (relative to project root)
  const fileRefs: string[] = []
  const cwd = process.cwd()

  // Add task file reference (required)
  const taskPath = join(getPlansDir(), `tasks-${featureName}.yml`)
  if (existsSync(taskPath)) {
    const relPath = relative(cwd, taskPath)
    fileRefs.push(`@${relPath}`)
  }

  // Add progress file reference if exists
  const progressPath = join(getPlansDir(), `progress-${featureName}.txt`)
  if (existsSync(progressPath)) {
    const relPath = relative(cwd, progressPath)
    fileRefs.push(`@${relPath}`)
  }

  // Add AGENTS.md reference if exists
  const agentsPath = join(cwd, 'AGENTS.md')
  if (existsSync(agentsPath)) {
    fileRefs.push(`@AGENTS.md`)
  }

  // Add phase-specific header with file references
  parts.push(getPhaseHeader(phase))
  parts.push('')

  if (fileRefs.length > 0) {
    parts.push('# CONTEXT FILES')
    parts.push('')
    parts.push(fileRefs.join(' '))
    parts.push('')
  }

  // Add phase-specific instructions
  parts.push(getPhaseInstructions(phase, config, taskId, reviewFeedback))

  return parts.join('\n')
}

/**
 * Get the header text for each phase.
 */
function getPhaseHeader(phase: PromptPhase): string {
  switch (phase) {
    case 'implement':
      return '# HONE: IMPLEMENT PHASE'
    case 'review':
      return '# HONE: REVIEW PHASE'
    case 'finalize':
      return '# HONE: FINALIZE PHASE'
  }
}

/**
 * Get phase-specific instructions.
 */
function getPhaseInstructions(
  phase: PromptPhase,
  config: HoneConfig,
  taskId?: string,
  reviewFeedback?: string
): string {
  const feedbackInstructions = 'test: bun test'
  const lintCommand = config.lintCommand

  switch (phase) {
    case 'implement':
      return getImplementInstructions(feedbackInstructions, lintCommand)
    case 'review':
      return getReviewInstructions(taskId)
    case 'finalize':
      return getFinalizeInstructions(feedbackInstructions, lintCommand, reviewFeedback)
  }
}

/**
 * Instructions for the implement phase.
 */
function getImplementInstructions(feedbackInstructions: string, lintCommand?: string): string {
  let instructions = `# TASK SELECTION

CRITICAL: You MUST only choose tasks from the task file referenced in CONTEXT FILES above.
Do NOT select tasks from any other task file, even if you can access them.

Pick the next single task that's not completed yet. Prioritize from this list (where 1 is highest priority):

1. Dependencies
2. Architectural decisions and core abstractions
3. Integration points between modules
4. Unknown unknowns and spike work
5. Standard features
6. Polish and quick wins

If there are no tasks left with \`status: pending\`, output \`<promise>COMPLETE</promise>\` and stop.

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

# EXECUTION

Complete the single task.

If you find that the task is larger than you expected (for instance, requires a refactor first), output "HANG ON A SECOND".

Then, find a way to break it into a smaller chunk and only do that chunk (i.e. complete the smaller refactor).

IMPORTANT: Do NOT run tests or feedback loops during exploration or incremental development.
Only run feedback loops AFTER you have fully completed implementing the task.

# FEEDBACK LOOPS

Run feedback loops ONLY when the task implementation is complete:

${feedbackInstructions}`

  if (lintCommand) {
    instructions += `\n${lintCommand}`
  }

  instructions += `

If CLI or script, run them and verify output.

If tests fail or there are errors you cannot fix, DO NOT output TASK_COMPLETED.
Instead, exit with an error. The task will remain pending and be retried on the next run.

# IMPORTANT: DO NOT COMMIT YET

DO NOT create a git commit during this phase. All commits happen in the finalize phase.
Your changes should remain uncommitted at this point.

# OUTPUT

At the end, output on a single line:
TASK_COMPLETED: <task-id>

This allows hone to track which task you completed.
Only output this marker if the task is fully complete and all feedback loops pass.`

  return instructions
}

/**
 * Instructions for the review phase.
 */
function getReviewInstructions(taskId?: string): string {
  return `# REVIEW OBJECTIVE

Review the changes just made${taskId ? ` for task ${taskId}` : ''}.

# REVIEW CHECKLIST

Check for:
1. Correctness - Does the implementation match requirements?
2. Tests - Are there adequate tests? Do they pass?
3. Security - Any security concerns or vulnerabilities?
4. Performance - Any obvious performance issues?
5. Code quality - Is the code maintainable and well-structured?
6. Edge cases - Are edge cases handled?

# GIT DIFF

Use git diff to see what changed:
- \`git diff HEAD\` - see unstaged changes
- \`git diff --staged\` - see staged changes
- \`git log -1 -p\` - see last commit if already committed

# OUTPUT

Provide specific, actionable feedback. If everything looks good, say "LGTM" (Looks Good To Me).

Structure your feedback as:
- **Issue**: Description of the problem
- **Suggestion**: How to fix it
- **Priority**: critical | high | medium | low`
}

/**
 * Instructions for the finalize phase.
 */
function getFinalizeInstructions(
  feedbackInstructions: string,
  lintCommand: string | undefined,
  reviewFeedback?: string
): string {
  let instructions = `# FINALIZE OBJECTIVE

Finalize the task by applying review feedback and updating all tracking files.

IMPORTANT: This is the ONLY phase where git commits are allowed. If you already committed in
the implement phase, you did it wrong - but continue with finalization anyway.

# REVIEW FEEDBACK
${reviewFeedback || 'No review feedback provided (review was skipped or approved).'}

# ACTIONS TO COMPLETE

1. **Apply Feedback** (if any)
   - Address all critical and high priority feedback
   - Only run feedback loops if you made changes to address feedback

2. **Run Final Feedback Loops** (if needed)
   - If you applied feedback or made any changes:
   ${feedbackInstructions}`

  if (lintCommand) {
    instructions += `\n   ${lintCommand}`
  }

  instructions += `

3. **Update Task File**
   - Mark the completed task with \`status: completed\`
   - Set \`completed_at: <ISO-8601-datetime>\`
   - DO NOT mark as completed if feedback wasn't fully addressed

4. **Update Progress File**
   - Append to progress-<feature>.txt with format:
     \`\`\`
     ================================================================================
     TASK-XXX: <task-title>
     Date: <ISO-8601-datetime>
     ================================================================================

     Summary:
     <concise summary of what was done>

     Files Changed:
     - file1.ts (created/modified/deleted with brief description)
     - file2.ts (...)

     Key Decisions:
     - Decision 1
     - Decision 2

     Next Task: <next-task-id> or "All tasks complete"
     \`\`\`

5. **Update AGENTS.md** (if learnings exist)
   - Add useful learnings and gotchas under appropriate heading
   - Be terse - only add truly useful info that future agents need
   - Don't duplicate existing info

6. **Git Commit** (REQUIRED - DO NOT SKIP THIS STEP)
   - You MUST create a git commit for this task to be considered complete
   - Stage all changes using: \`git add <files>\`
     * Task file (.plans/tasks-<feature>.yml)
     * Progress file (.plans/progress-<feature>.txt)
     * All code changes
     * AGENTS.md (if you updated it)
   - Commit with format: \`<feature>-<task-id>: <descriptive message>\`
   - Example: \`git commit -m "hone-task-009: add prompt construction module"\`
   - Verify commit succeeded by checking \`git log -1\` shows your commit
   - DO NOT push to remote

CRITICAL: The git commit is NOT optional. Without it, your work will not be properly tracked.
If you cannot commit (e.g., no changes to commit), that indicates a problem - investigate and fix it.

# OUTPUT

At the end, output on a single line:
FINALIZED: <task-id>

Only output this marker AFTER you have successfully created the git commit.`

  return instructions
}
