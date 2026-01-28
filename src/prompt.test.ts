import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { constructPrompt, type PromptPhase } from './prompt';
import type { XLoopConfig } from './config';

const TEST_WORKSPACE = join(process.cwd(), '.test-prompt-workspace');
const TEST_PLANS_DIR = join(TEST_WORKSPACE, '.plans');

beforeEach(() => {
  // Create isolated test workspace
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
  mkdirSync(TEST_PLANS_DIR, { recursive: true });
  
  // Change to test workspace
  process.chdir(TEST_WORKSPACE);
});

afterEach(() => {
  // Clean up and return to original directory
  const originalDir = join(TEST_WORKSPACE, '..');
  process.chdir(originalDir);
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
});

const mockConfig: XLoopConfig = {
  defaultAgent: 'claude',
  models: {
    opencode: 'claude-sonnet-4-20250514',
    claude: 'claude-sonnet-4-20250514'
  },
  commitPrefix: 'xloop',
  feedbackCommand: 'bun test',
  lintCommand: 'bun run lint'
};

describe('constructPrompt', () => {
  test('includes phase header', async () => {
    // Create minimal task file
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# XLOOP: IMPLEMENT PHASE');
  });
  
  test('includes AGENTS.md if exists', async () => {
    writeFileSync(join(TEST_WORKSPACE, 'AGENTS.md'), '# Learning 1\nSome pattern');
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# CONTEXT: AGENTS.md');
    expect(prompt).toContain('# Learning 1');
  });
  
  test('includes task file content', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    title: Test Task\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# CONTEXT: Task List');
    expect(prompt).toContain('task-001');
    expect(prompt).toContain('Test Task');
  });
  
  test('includes progress file if exists', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    writeFileSync(
      join(TEST_PLANS_DIR, 'progress-test.txt'),
      'Previous iteration completed'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# CONTEXT: Progress Log');
    expect(prompt).toContain('Previous iteration completed');
  });
  
  test('implement phase includes task selection instructions', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# TASK SELECTION');
    expect(prompt).toContain('status: pending');
    expect(prompt).toContain('bun test');
  });
  
  test('implement phase includes lint command if configured', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('bun run lint');
  });
  
  test('review phase includes review checklist', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'review',
      featureName: 'test',
      config: mockConfig,
      taskId: 'task-001'
    });
    
    expect(prompt).toContain('# XLOOP: REVIEW PHASE');
    expect(prompt).toContain('# REVIEW CHECKLIST');
    expect(prompt).toContain('Correctness');
    expect(prompt).toContain('task-001');
  });
  
  test('finalize phase includes review feedback', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const feedback = '**Issue**: Missing error handling\n**Suggestion**: Add try-catch';
    const prompt = await constructPrompt({
      phase: 'finalize',
      featureName: 'test',
      config: mockConfig,
      taskId: 'task-001',
      reviewFeedback: feedback
    });
    
    expect(prompt).toContain('# XLOOP: FINALIZE PHASE');
    expect(prompt).toContain('# REVIEW FEEDBACK');
    expect(prompt).toContain('Missing error handling');
  });
  
  test('finalize phase without review feedback shows default message', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'finalize',
      featureName: 'test',
      config: mockConfig,
      taskId: 'task-001'
    });
    
    expect(prompt).toContain('No review feedback provided');
  });
  
  test('handles missing AGENTS.md gracefully', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).not.toContain('# CONTEXT: AGENTS.md');
    expect(prompt).toContain('# TASK SELECTION');
  });
  
  test('handles missing progress file gracefully', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).not.toContain('# CONTEXT: Progress Log');
    expect(prompt).toContain('# TASK SELECTION');
  });
  
  test('uses default feedback command if not configured', async () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const configWithoutFeedback: XLoopConfig = {
      ...mockConfig,
      feedbackCommand: undefined
    };
    
    const prompt = await constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: configWithoutFeedback
    });
    
    expect(prompt).toContain('bun test');
  });
});
