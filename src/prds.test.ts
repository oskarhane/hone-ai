import { describe, test, expect } from 'bun:test';
import {
  extractFeatureName,
  calculateStatus,
  type TaskFile,
  type Task
} from './prds';

describe('extractFeatureName', () => {
  test('extracts feature name from PRD filename', () => {
    expect(extractFeatureName('prd-xloop.md')).toBe('xloop');
    expect(extractFeatureName('prd-delete-button.md')).toBe('delete-button');
    expect(extractFeatureName('prd-user-auth.md')).toBe('user-auth');
  });
});

describe('calculateStatus', () => {
  test('returns "not started" when task file is null', () => {
    const result = calculateStatus(null);
    expect(result.status).toBe('not started');
    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  test('returns "not started" when no tasks exist', () => {
    const taskFile: TaskFile = {
      feature: 'test',
      prd: 'prd-test.md',
      created_at: '2026-01-28T12:00:00Z',
      updated_at: '2026-01-28T12:00:00Z',
      tasks: []
    };
    const result = calculateStatus(taskFile);
    expect(result.status).toBe('not started');
    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  test('returns "not started" when all tasks are pending', () => {
    const taskFile: TaskFile = {
      feature: 'test',
      prd: 'prd-test.md',
      created_at: '2026-01-28T12:00:00Z',
      updated_at: '2026-01-28T12:00:00Z',
      tasks: [
        { id: 'task-001', title: 'Task 1', description: 'Desc', status: 'pending' },
        { id: 'task-002', title: 'Task 2', description: 'Desc', status: 'pending' }
      ]
    };
    const result = calculateStatus(taskFile);
    expect(result.status).toBe('not started');
    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(2);
  });

  test('returns "in progress" when some tasks are completed', () => {
    const taskFile: TaskFile = {
      feature: 'test',
      prd: 'prd-test.md',
      created_at: '2026-01-28T12:00:00Z',
      updated_at: '2026-01-28T12:00:00Z',
      tasks: [
        { id: 'task-001', title: 'Task 1', description: 'Desc', status: 'completed' },
        { id: 'task-002', title: 'Task 2', description: 'Desc', status: 'pending' },
        { id: 'task-003', title: 'Task 3', description: 'Desc', status: 'pending' }
      ]
    };
    const result = calculateStatus(taskFile);
    expect(result.status).toBe('in progress');
    expect(result.completedCount).toBe(1);
    expect(result.totalCount).toBe(3);
  });

  test('returns "completed" when all tasks are completed', () => {
    const taskFile: TaskFile = {
      feature: 'test',
      prd: 'prd-test.md',
      created_at: '2026-01-28T12:00:00Z',
      updated_at: '2026-01-28T12:00:00Z',
      tasks: [
        { id: 'task-001', title: 'Task 1', description: 'Desc', status: 'completed' },
        { id: 'task-002', title: 'Task 2', description: 'Desc', status: 'completed' }
      ]
    };
    const result = calculateStatus(taskFile);
    expect(result.status).toBe('completed');
    expect(result.completedCount).toBe(2);
    expect(result.totalCount).toBe(2);
  });
});
