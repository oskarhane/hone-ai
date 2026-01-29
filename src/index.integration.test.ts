import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

// Set test environment
const originalEnv = process.env.BUN_ENV;
beforeAll(() => {
  process.env.BUN_ENV = 'test';
  process.env.ANTHROPIC_API_KEY = 'test-api-key';
});
afterAll(() => {
  process.env.BUN_ENV = originalEnv;
  delete process.env.ANTHROPIC_API_KEY;
});

const TEST_CWD = join(process.cwd(), 'test-cli-integration');
const CLI_PATH = join(process.cwd(), 'src', 'index.ts');

/**
 * Helper to run CLI command
 */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('bun', [CLI_PATH, ...args], {
    cwd: TEST_CWD,
    encoding: 'utf-8',
    env: { ...process.env, BUN_ENV: 'test', ANTHROPIC_API_KEY: 'test-api-key' }
  });
  
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0
  };
}

/**
 * Helper to create mock PRD file
 */
function createMockPrd(feature: string, content: string = '# Feature\n\nTest PRD content'): void {
  const plansDir = join(TEST_CWD, '.plans');
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true });
  }
  writeFileSync(join(plansDir, `prd-${feature}.md`), content);
}

/**
 * Helper to create mock task file
 */
function createMockTaskFile(feature: string, tasks: any[]): void {
  const plansDir = join(TEST_CWD, '.plans');
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true });
  }
  
  const yaml = `feature: ${feature}
prd: ./prd-${feature}.md
created_at: 2026-01-28T12:00:00Z
updated_at: 2026-01-28T12:00:00Z

tasks:
${tasks.map(t => `  - id: ${t.id}
    title: "${t.title}"
    description: "${t.description}"
    status: ${t.status}
    dependencies: ${t.dependencies ? JSON.stringify(t.dependencies) : '[]'}
    acceptance_criteria: ${t.acceptance_criteria ? JSON.stringify(t.acceptance_criteria) : '[]'}
    completed_at: ${t.completed_at || 'null'}`).join('\n')}
`;
  
  writeFileSync(join(plansDir, `tasks-${feature}.yml`), yaml);
}

describe('CLI Integration Tests', () => {
  beforeEach(() => {
    // Create test workspace
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true });
    }
    mkdirSync(TEST_CWD, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true });
    }
  });

  describe('prds command', () => {
    test('shows message when no PRDs exist', () => {
      const result = runCli(['prds']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No PRDs found');
      expect(result.stdout).toContain('Create a PRD with: hone prd');
    });

    test('lists PRD with no task file', () => {
      createMockPrd('test-feature');
      
      const result = runCli(['prds']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.plans/prd-test-feature.md');
      expect(result.stdout).toContain('Tasks: none');
      expect(result.stdout).toContain('Status: not started');
    });

    test('lists PRD with task file showing in progress status', () => {
      createMockPrd('test-feature');
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'completed', dependencies: [], completed_at: '2026-01-28T12:00:00Z' },
        { id: 'task-2', title: 'Task 2', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['prds']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.plans/prd-test-feature.md');
      expect(result.stdout).toContain('Tasks: .plans/tasks-test-feature.yml');
      expect(result.stdout).toContain('Status: in progress (1/2 completed)');
    });

    test('lists PRD with completed status', () => {
      createMockPrd('test-feature');
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'completed', dependencies: [], completed_at: '2026-01-28T12:00:00Z' },
        { id: 'task-2', title: 'Task 2', description: 'Test', status: 'completed', dependencies: [], completed_at: '2026-01-28T12:00:00Z' }
      ]);
      
      const result = runCli(['prds']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.plans/prd-test-feature.md');
      expect(result.stdout).toContain('Status: completed');
    });

    test('lists multiple PRDs', () => {
      createMockPrd('feature-one');
      createMockPrd('feature-two');
      createMockTaskFile('feature-one', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['prds']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.plans/prd-feature-one.md');
      expect(result.stdout).toContain('.plans/prd-feature-two.md');
      expect(result.stdout).toContain('.plans/tasks-feature-one.yml');
      expect(result.stdout).toContain('Tasks: none');
    });
  });

  describe('status command', () => {
    test('shows message when no incomplete tasks', () => {
      const result = runCli(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No incomplete task lists found');
      expect(result.stdout).toContain('All tasks completed!');
    });

    test('lists incomplete task file with next task', () => {
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'completed', dependencies: [], completed_at: '2026-01-28T12:00:00Z' },
        { id: 'task-2', title: 'Task 2', description: 'Test task 2', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.plans/tasks-test-feature.yml');
      expect(result.stdout).toContain('Feature: test-feature');
      expect(result.stdout).toContain('Progress: 1/2 tasks completed');
      expect(result.stdout).toContain('Next: task-2 - Task 2');
    });

    test('shows waiting for dependencies when no task available', () => {
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'pending', dependencies: [] },
        { id: 'task-2', title: 'Task 2', description: 'Test', status: 'pending', dependencies: ['task-1'] }
      ]);
      
      // Mark task-1 as in_progress so task-2 is blocked
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'in_progress', dependencies: [] },
        { id: 'task-2', title: 'Task 2', description: 'Test', status: 'pending', dependencies: ['task-1'] }
      ]);
      
      const result = runCli(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Next: (waiting for dependencies)');
    });

    test('excludes fully completed task files', () => {
      createMockTaskFile('completed-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'completed', dependencies: [], completed_at: '2026-01-28T12:00:00Z' }
      ]);
      createMockTaskFile('incomplete-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('completed-feature');
      expect(result.stdout).toContain('incomplete-feature');
    });

    test('lists multiple incomplete task files', () => {
      createMockTaskFile('feature-one', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      createMockTaskFile('feature-two', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'completed', dependencies: [], completed_at: '2026-01-28T12:00:00Z' },
        { id: 'task-2', title: 'Task 2', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('feature-one');
      expect(result.stdout).toContain('feature-two');
      expect(result.stdout).toContain('0/1 tasks completed');
      expect(result.stdout).toContain('1/2 tasks completed');
    });
  });

  describe('CLI flags', () => {
    test('--help shows usage information', () => {
      const result = runCli(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hone');
      expect(result.stdout).toContain('AI Coding Agent Orchestrator');
    });

    test('--version shows version', () => {
      const result = runCli(['--version']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('0.1.0');
    });
  });

  describe('prd-to-tasks command', () => {
    test('shows error when PRD file does not exist', () => {
      const result = runCli(['prd-to-tasks', 'nonexistent-prd.md']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error generating tasks');
    });

    test('shows error when PRD filename format is invalid', () => {
      // Create a file with invalid format
      const plansDir = join(TEST_CWD, '.plans');
      mkdirSync(plansDir, { recursive: true });
      writeFileSync(join(plansDir, 'invalid-format.md'), '# Test');
      
      const result = runCli(['prd-to-tasks', join(plansDir, 'invalid-format.md')]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error generating tasks');
    });
  });

  describe('run command', () => {
    test('requires iterations flag', () => {
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['run', '.plans/tasks-test-feature.yml']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required option');
    });

    test('requires valid iterations number', () => {
      createMockTaskFile('test-feature', [
        { id: 'task-1', title: 'Task 1', description: 'Test', status: 'pending', dependencies: [] }
      ]);
      
      const result = runCli(['run', '.plans/tasks-test-feature.yml', '-i', 'invalid']);
      
      // Should fail because 'invalid' parses to NaN which fails validation
      expect(result.exitCode).toBe(1);
    });

    test('validates tasks file exists', () => {
      const result = runCli(['run', 'nonexistent.yml', '-i', '1']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error executing tasks');
    });
  });

  describe('init command', () => {
    test('creates .plans directory and config file in fresh directory', () => {
      const result = runCli(['init']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Initialized hone successfully!');
      expect(result.stdout).toContain('✓ Created .plans/ directory');
      expect(result.stdout).toContain('✓ Created .plans/hone.config.yml');
      expect(result.stdout).toContain('Next steps:');
      
      // Verify files were created
      expect(existsSync(join(TEST_CWD, '.plans'))).toBe(true);
      expect(existsSync(join(TEST_CWD, '.plans', 'hone.config.yml'))).toBe(true);
    });

    test('detects when already initialized', () => {
      // First init
      runCli(['init']);
      
      // Second init
      const result = runCli(['init']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hone is already initialized');
      expect(result.stdout).toContain('.plans/ directory: exists');
      expect(result.stdout).toContain('config file: exists');
    });

    test('creates only missing parts when partially initialized', () => {
      // Create .plans directory manually
      mkdirSync(join(TEST_CWD, '.plans'), { recursive: true });
      
      const result = runCli(['init']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Initialized hone successfully!');
      expect(result.stdout).toContain('• .plans/ directory already exists');
      expect(result.stdout).toContain('✓ Created .plans/hone.config.yml');
      
      // Verify config was created
      expect(existsSync(join(TEST_CWD, '.plans', 'hone.config.yml'))).toBe(true);
    });
  });
});
