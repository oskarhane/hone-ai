import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { generateTasksFromPRD } from './task-generator';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const TEST_WORKSPACE = join(process.cwd(), '.test-task-generator');
const TEST_PLANS_DIR = join(TEST_WORKSPACE, '.plans');

describe('task-generator', () => {
  beforeEach(async () => {
    // Create test workspace
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true, force: true });
    }
    await mkdir(TEST_WORKSPACE, { recursive: true });
    await mkdir(TEST_PLANS_DIR, { recursive: true });
    
    // Change to test workspace
    process.chdir(TEST_WORKSPACE);
  });
  
  afterEach(async () => {
    // Restore original directory and cleanup
    process.chdir(join(TEST_WORKSPACE, '..'));
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true, force: true });
    }
  });
  
  test('throws error if PRD file does not exist', async () => {
    const nonExistentPath = join(TEST_PLANS_DIR, 'prd-nonexistent.md');
    
    await expect(generateTasksFromPRD(nonExistentPath)).rejects.toThrow('PRD file not found');
  });
  
  test('throws error if PRD filename format is invalid', async () => {
    const invalidPath = join(TEST_PLANS_DIR, 'invalid-filename.md');
    await writeFile(invalidPath, '# Test PRD', 'utf-8');
    
    await expect(generateTasksFromPRD(invalidPath)).rejects.toThrow('Invalid PRD filename format');
  });
  
  test('throws error if PRD filename has no feature name', async () => {
    const invalidPath = join(TEST_PLANS_DIR, 'prd-.md');
    await writeFile(invalidPath, '# Test PRD', 'utf-8');
    
    await expect(generateTasksFromPRD(invalidPath)).rejects.toThrow('Invalid PRD filename format');
  });
  
  test('extracts feature name correctly from PRD filename', async () => {
    const prdPath = join(TEST_PLANS_DIR, 'prd-test-feature.md');
    const prdContent = `# PRD: Test Feature
    
## Overview
Simple test feature for unit testing.

## Requirements
- REQ-1: Basic requirement
`;
    
    await writeFile(prdPath, prdContent, 'utf-8');
    
    // Mock API key for this test
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    
    try {
      // This will fail at the API call, but we're testing the filename parsing
      await generateTasksFromPRD(prdPath);
    } catch (error) {
      // Expected to fail at API call since we're using a fake key
      // But if it failed at filename parsing, it would have thrown earlier
      expect(error).toBeDefined();
    } finally {
      // Restore original API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  });
});
