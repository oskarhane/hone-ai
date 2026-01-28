import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getPlansDir } from './config';
import { loadTaskFile, calculateStatus } from './prds';
import type { Task, TaskFile } from './prds';

export interface TaskFileStatus {
  filename: string;
  feature: string;
  completedCount: number;
  totalCount: number;
  nextTask: Task | null;
}

/**
 * Get all task files in .plans/ directory
 */
export function listTaskFiles(): string[] {
  const plansDir = getPlansDir();
  if (!existsSync(plansDir)) {
    return [];
  }
  
  const files = readdirSync(plansDir);
  return files.filter(file => file.startsWith('tasks-') && file.endsWith('.yml'));
}

/**
 * Find next task respecting dependencies
 * Returns first pending task where all dependencies are completed or cancelled
 */
export function findNextTask(taskFile: TaskFile): Task | null {
  if (!taskFile.tasks || taskFile.tasks.length === 0) {
    return null;
  }
  
  // Find first pending task where all dependencies are satisfied
  for (const task of taskFile.tasks) {
    if (task.status === 'pending') {
      // Check if all dependencies are completed or cancelled
      const dependencies = task.dependencies || [];
      const allDepsCompleted = dependencies.every(depId => {
        const depTask = taskFile.tasks.find(t => t.id === depId);
        return depTask && (depTask.status === 'completed' || depTask.status === 'cancelled');
      });
      
      if (allDepsCompleted) {
        return task;
      }
    }
  }
  
  return null;
}

/**
 * Get status for a single task file
 */
export async function getTaskFileStatus(taskFilename: string): Promise<TaskFileStatus | null> {
  const taskFile = await loadTaskFile(taskFilename);
  if (!taskFile) {
    return null;
  }
  
  const { status, completedCount, totalCount } = calculateStatus(taskFile);
  
  // Skip fully completed files
  if (status === 'completed') {
    return null;
  }
  
  const nextTask = findNextTask(taskFile);
  
  return {
    filename: taskFilename,
    feature: taskFile.feature,
    completedCount,
    totalCount,
    nextTask
  };
}

/**
 * List all incomplete task files with their status
 */
export async function listIncompleteTaskFiles(): Promise<TaskFileStatus[]> {
  const taskFiles = listTaskFiles();
  const statusList = await Promise.all(
    taskFiles.map(file => getTaskFileStatus(file))
  );
  
  // Filter out null (completed files) and return
  return statusList.filter((s): s is TaskFileStatus => s !== null);
}
