import { existsSync } from 'fs';
import { resolve } from 'path';
import type { AgentType } from './config';
import { loadConfig } from './config';
import { spawnAgent, isAgentAvailable } from './agent';
import { constructPrompt, type PromptPhase } from './prompt';
import { exitWithError, ErrorMessages } from './errors';

export interface ExecuteTasksOptions {
  tasksFile: string;
  iterations: number;
  agent: AgentType;
  skipPhase?: 'review';
}

/**
 * Execute tasks iteratively using the specified agent.
 * Runs for the specified number of iterations or until all tasks complete.
 */
export async function executeTasks(options: ExecuteTasksOptions): Promise<void> {
  const { tasksFile, iterations, agent, skipPhase } = options;
  
  // Validate tasks file exists
  const tasksPath = resolve(tasksFile);
  if (!existsSync(tasksPath)) {
    const { message, details } = ErrorMessages.FILE_NOT_FOUND(tasksPath);
    exitWithError(message, details);
  }
  
  // Validate iterations is a positive integer
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('Iterations must be a positive integer');
  }
  
  // Check if agent is available
  const available = await isAgentAvailable(agent);
  if (!available) {
    const { message, details } = ErrorMessages.AGENT_NOT_FOUND(agent);
    exitWithError(message, details);
  }
  
  // Extract feature name from tasks file name
  const featureName = extractFeatureName(tasksPath);
  if (!featureName) {
    throw new Error(`Could not extract feature name from tasks file: ${tasksFile}`);
  }
  
  // Load config
  const config = await loadConfig();
  
  console.log(`Using agent: ${agent}`);
  console.log(`Tasks file: ${tasksFile}`);
  console.log(`Feature: ${featureName}`);
  console.log(`Iterations: ${iterations}`);
  if (skipPhase) {
    console.log(`Skipping phase: ${skipPhase}`);
  }
  console.log('');
  
  // Main iteration loop
  for (let i = 1; i <= iterations; i++) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ITERATION ${i}/${iterations}`);
    console.log('='.repeat(80));
    console.log('');
    
    // Phase 1: Implement
    console.log('Phase 1: Implement');
    console.log('-'.repeat(80));
    const implementPrompt = constructPrompt({
      phase: 'implement',
      featureName,
      config
    });
    
    const implementResult = await spawnAgent({
      agent,
      prompt: implementPrompt,
      workingDir: process.cwd()
    });
    
    if (implementResult.exitCode !== 0) {
      console.error('\n✗ Implement phase failed');
      console.error('\nThe agent encountered an error during task implementation.');
      console.error('The task has NOT been marked as completed.');
      console.error('When you run xloop again, it will retry the same task.');
      console.error(`\nAgent exit code: ${implementResult.exitCode}`);
      if (implementResult.stderr) {
        console.error('\nError output:');
        console.error(implementResult.stderr);
      }
      throw new Error(`Implement phase failed with exit code ${implementResult.exitCode}`);
    }
    
    // Extract task ID from output
    const completedTaskId = extractTaskId(implementResult.stdout, 'TASK_COMPLETED');
    if (completedTaskId) {
      console.log(`\n✓ Task ${completedTaskId} implementation complete`);
    } else {
      console.warn('\n⚠ Warning: No TASK_COMPLETED marker found in output');
    }
    
    // Check if all tasks are complete
    if (implementResult.stdout.includes('<promise>COMPLETE</promise>')) {
      console.log('\n✓ All tasks completed!');
      return;
    }
    
    // Phase 2: Review (unless skipped)
    let reviewFeedback: string | undefined;
    if (skipPhase !== 'review') {
      console.log('\nPhase 2: Review');
      console.log('-'.repeat(80));
      const reviewPrompt = constructPrompt({
        phase: 'review',
        featureName,
        config,
        taskId: completedTaskId
      });
      
      const reviewResult = await spawnAgent({
        agent,
        prompt: reviewPrompt,
        workingDir: process.cwd()
      });
      
      if (reviewResult.exitCode !== 0) {
        console.error('\n✗ Review phase failed');
        console.error('\nThe agent encountered an error during task review.');
        console.error('The task has NOT been marked as completed.');
        console.error('When you run xloop again, it will retry the same task.');
        console.error(`\nAgent exit code: ${reviewResult.exitCode}`);
        if (reviewResult.stderr) {
          console.error('\nError output:');
          console.error(reviewResult.stderr);
        }
        throw new Error(`Review phase failed with exit code ${reviewResult.exitCode}`);
      }
      
      reviewFeedback = reviewResult.stdout;
    } else {
      console.log('\nPhase 2: Review (skipped)');
    }
    
    // Phase 3: Finalize
    console.log('\nPhase 3: Finalize');
    console.log('-'.repeat(80));
    const finalizePrompt = constructPrompt({
      phase: 'finalize',
      featureName,
      config,
      taskId: completedTaskId,
      reviewFeedback
    });
    
    const finalizeResult = await spawnAgent({
      agent,
      prompt: finalizePrompt,
      workingDir: process.cwd()
    });
    
    if (finalizeResult.exitCode !== 0) {
      console.error('\n✗ Finalize phase failed');
      console.error('\nThe agent encountered an error during task finalization.');
      console.error('The task may not have been properly committed or marked as completed.');
      console.error('Review the git status and task file manually before continuing.');
      console.error(`\nAgent exit code: ${finalizeResult.exitCode}`);
      if (finalizeResult.stderr) {
        console.error('\nError output:');
        console.error(finalizeResult.stderr);
      }
      throw new Error(`Finalize phase failed with exit code ${finalizeResult.exitCode}`);
    }
    
    // Verify task was finalized
    const finalizedTaskId = extractTaskId(finalizeResult.stdout, 'FINALIZED');
    if (finalizedTaskId) {
      console.log(`\n✓ Iteration ${i} complete - Task ${finalizedTaskId} finalized`);
    } else {
      console.log(`\n✓ Iteration ${i} complete`);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Completed ${iterations} iterations`);
  console.log('='.repeat(80));
}

/**
 * Extract feature name from tasks file path.
 * Expected format: tasks-<feature-name>.yml or .plans/tasks-<feature-name>.yml
 */
function extractFeatureName(tasksPath: string): string | undefined {
  const match = tasksPath.match(/tasks-([^/]+)\.yml$/);
  return match ? match[1] : undefined;
}

/**
 * Extract task ID from agent output.
 * Looks for patterns like "TASK_COMPLETED: task-123" or "FINALIZED: task-123"
 */
function extractTaskId(output: string, marker: 'TASK_COMPLETED' | 'FINALIZED'): string | undefined {
  const regex = new RegExp(`${marker}:\\s*([\\w-]+)`, 'i');
  const match = output.match(regex);
  return match ? match[1] : undefined;
}
