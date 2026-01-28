import { describe, test, expect } from 'bun:test';
import { findNextTask } from './status';
import type { TaskFile } from './prds';

describe('status', () => {
  describe('findNextTask', () => {
    test('returns first pending task with no dependencies', () => {
      const taskFile: TaskFile = {
        feature: 'test',
        prd: './prd-test.md',
        created_at: '2026-01-28',
        updated_at: '2026-01-28',
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            status: 'pending',
            dependencies: []
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task',
            status: 'pending',
            dependencies: []
          }
        ]
      };
      
      const next = findNextTask(taskFile);
      expect(next?.id).toBe('task-1');
    });
    
    test('skips pending task with incomplete dependencies', () => {
      const taskFile: TaskFile = {
        feature: 'test',
        prd: './prd-test.md',
        created_at: '2026-01-28',
        updated_at: '2026-01-28',
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            status: 'pending',
            dependencies: []
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task',
            status: 'pending',
            dependencies: ['task-1']
          }
        ]
      };
      
      const next = findNextTask(taskFile);
      expect(next?.id).toBe('task-1');
    });
    
    test('returns pending task when dependencies completed', () => {
      const taskFile: TaskFile = {
        feature: 'test',
        prd: './prd-test.md',
        created_at: '2026-01-28',
        updated_at: '2026-01-28',
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            status: 'completed',
            dependencies: []
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task',
            status: 'pending',
            dependencies: ['task-1']
          }
        ]
      };
      
      const next = findNextTask(taskFile);
      expect(next?.id).toBe('task-2');
    });
    
    test('returns null when no pending tasks', () => {
      const taskFile: TaskFile = {
        feature: 'test',
        prd: './prd-test.md',
        created_at: '2026-01-28',
        updated_at: '2026-01-28',
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            status: 'completed',
            dependencies: []
          }
        ]
      };
      
      const next = findNextTask(taskFile);
      expect(next).toBeNull();
    });
    
    test('returns null when all pending tasks blocked by dependencies', () => {
      const taskFile: TaskFile = {
        feature: 'test',
        prd: './prd-test.md',
        created_at: '2026-01-28',
        updated_at: '2026-01-28',
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            status: 'pending',
            dependencies: []
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task',
            status: 'pending',
            dependencies: ['task-1']
          }
        ]
      };
      
      // Mark task-1 as something other than completed
      if (taskFile.tasks[0]) {
        taskFile.tasks[0].status = 'in_progress';
      }
      
      const next = findNextTask(taskFile);
      expect(next).toBeNull();
    });
    
    test('handles empty task list', () => {
      const taskFile: TaskFile = {
        feature: 'test',
        prd: './prd-test.md',
        created_at: '2026-01-28',
        updated_at: '2026-01-28',
        tasks: []
      };
      
      const next = findNextTask(taskFile);
      expect(next).toBeNull();
    });
  });
});
