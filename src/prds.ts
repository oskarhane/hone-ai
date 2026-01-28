import { readdirSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';
import { getPlansDir } from './config';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies?: string[];
  acceptance_criteria?: string[];
  completed_at?: string | null;
}

export interface TaskFile {
  feature: string;
  prd: string;
  created_at: string;
  updated_at: string;
  tasks: Task[];
}

export interface PrdInfo {
  filename: string;
  taskFile?: string;
  status: 'not started' | 'in progress' | 'completed';
  completedCount?: number;
  totalCount?: number;
}

/**
 * Extract feature name from PRD filename
 * e.g., "prd-xloop.md" -> "xloop"
 */
export function extractFeatureName(prdFilename: string): string {
  return prdFilename.replace(/^prd-/, '').replace(/\.md$/, '');
}

/**
 * Get all PRD files in .plans/ directory
 */
export function listPrdFiles(): string[] {
  const plansDir = getPlansDir();
  if (!existsSync(plansDir)) {
    return [];
  }
  
  const files = readdirSync(plansDir);
  return files.filter(file => file.startsWith('prd-') && file.endsWith('.md'));
}

/**
 * Load and parse a task file
 */
export async function loadTaskFile(taskFilename: string): Promise<TaskFile | null> {
  const plansDir = getPlansDir();
  const taskPath = join(plansDir, taskFilename);
  
  if (!existsSync(taskPath)) {
    return null;
  }
  
  try {
    const content = await readFile(taskPath, 'utf-8');
    const parsed = yaml.load(content) as TaskFile;
    return parsed;
  } catch (error) {
    console.error(`Error parsing task file ${taskFilename}:`, error);
    return null;
  }
}

/**
 * Calculate status from task file
 */
export function calculateStatus(taskFile: TaskFile | null): {
  status: 'not started' | 'in progress' | 'completed';
  completedCount: number;
  totalCount: number;
} {
  if (!taskFile || !taskFile.tasks || taskFile.tasks.length === 0) {
    return { status: 'not started', completedCount: 0, totalCount: 0 };
  }
  
  const totalCount = taskFile.tasks.length;
  const completedCount = taskFile.tasks.filter(t => t.status === 'completed').length;
  
  if (completedCount === 0) {
    return { status: 'not started', completedCount, totalCount };
  } else if (completedCount === totalCount) {
    return { status: 'completed', completedCount, totalCount };
  } else {
    return { status: 'in progress', completedCount, totalCount };
  }
}

/**
 * Get PRD info including status
 */
export async function getPrdInfo(prdFilename: string): Promise<PrdInfo> {
  const featureName = extractFeatureName(prdFilename);
  const taskFilename = `tasks-${featureName}.yml`;
  const plansDir = getPlansDir();
  const taskPath = join(plansDir, taskFilename);
  
  const taskFile = existsSync(taskPath) ? await loadTaskFile(taskFilename) : null;
  const { status, completedCount, totalCount } = calculateStatus(taskFile);
  
  return {
    filename: prdFilename,
    taskFile: taskFile ? taskFilename : undefined,
    status,
    completedCount: taskFile ? completedCount : undefined,
    totalCount: taskFile ? totalCount : undefined
  };
}

/**
 * List all PRDs with their info
 */
export async function listPrds(): Promise<PrdInfo[]> {
  const prdFiles = listPrdFiles();
  const prds = await Promise.all(prdFiles.map(file => getPrdInfo(file)));
  return prds;
}
