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
  test('includes phase header', () => {
    // Create minimal task file
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# XLOOP: IMPLEMENT PHASE');
  });
  
  test('includes AGENTS.md reference if exists', () => {
    writeFileSync(join(TEST_WORKSPACE, 'AGENTS.md'), '# Learning 1\nSome pattern');
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# CONTEXT FILES');
    expect(prompt).toContain('@AGENTS.md');
  });
  
  test('includes task file reference', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    title: Test Task\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# CONTEXT FILES');
    expect(prompt).toContain('@.plans/tasks-test.yml');
  });
  
  test('includes progress file reference if exists', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    writeFileSync(
      join(TEST_PLANS_DIR, 'progress-test.txt'),
      'Previous iteration completed'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# CONTEXT FILES');
    expect(prompt).toContain('@.plans/progress-test.txt');
  });
  
  test('implement phase includes task selection instructions', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('# TASK SELECTION');
    expect(prompt).toContain('bun test');
  });
  
  test('implement phase includes lint command if configured', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('bun run lint');
  });
  
  test('review phase includes review checklist', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
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
  
  test('finalize phase includes review feedback', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const feedback = '**Issue**: Missing error handling\n**Suggestion**: Add try-catch';
    const prompt = constructPrompt({
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
  
  test('finalize phase without review feedback shows default message', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'finalize',
      featureName: 'test',
      config: mockConfig,
      taskId: 'task-001'
    });
    
    expect(prompt).toContain('No review feedback provided');
  });
  
  test('handles missing AGENTS.md gracefully', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).not.toContain('@AGENTS.md');
    expect(prompt).toContain('# TASK SELECTION');
  });
  
  test('handles missing progress file gracefully', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).not.toContain('progress-test.txt');
    expect(prompt).toContain('# TASK SELECTION');
  });
  
  test('uses default feedback command if not configured', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const configWithoutFeedback: XLoopConfig = {
      ...mockConfig,
      feedbackCommand: undefined
    };
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: configWithoutFeedback
    });
    
    expect(prompt).toContain('bun test');
  });
  
  test('implement phase includes failure handling instructions', () => {
    writeFileSync(
      join(TEST_PLANS_DIR, 'tasks-test.yml'),
      'tasks:\n  - id: task-001\n    status: pending\n'
    );
    
    const prompt = constructPrompt({
      phase: 'implement',
      featureName: 'test',
      config: mockConfig
    });
    
    expect(prompt).toContain('If tests fail or there are errors you cannot fix');
    expect(prompt).toContain('DO NOT output TASK_COMPLETED');
    expect(prompt).toContain('task will remain pending');
    expect(prompt).toContain('Only output this marker if the task is fully complete');
  });
});
