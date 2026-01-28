import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { 
  getPlansDir, 
  ensurePlansDir, 
  getConfigPath, 
  loadConfig, 
  saveConfig,
  getApiKey,
  type XLoopConfig 
} from '../config';

const TEST_CWD = join(process.cwd(), 'test-workspace');

describe('Config Management', () => {
  beforeEach(() => {
    // Create test workspace
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true });
    }
    mkdirSync(TEST_CWD, { recursive: true });
    process.chdir(TEST_CWD);
  });

  afterEach(() => {
    // Cleanup
    process.chdir(join(TEST_CWD, '..'));
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true });
    }
  });

  test('getPlansDir returns correct path', () => {
    const plansDir = getPlansDir();
    expect(plansDir).toBe(join(TEST_CWD, '.plans'));
  });

  test('ensurePlansDir creates directory if not exists', () => {
    const plansDir = getPlansDir();
    expect(existsSync(plansDir)).toBe(false);
    
    ensurePlansDir();
    
    expect(existsSync(plansDir)).toBe(true);
  });

  test('ensurePlansDir is idempotent', () => {
    ensurePlansDir();
    ensurePlansDir(); // Should not throw
    expect(existsSync(getPlansDir())).toBe(true);
  });

  test('loadConfig creates default config if not exists', async () => {
    const config = await loadConfig();
    
    expect(config.defaultAgent).toBe('claude');
    expect(config.models.opencode).toBe('claude-sonnet-4');
    expect(config.models.claude).toBe('claude-sonnet-4');
    expect(config.commitPrefix).toBe('xloop');
    
    // Verify file was created
    expect(existsSync(getConfigPath())).toBe(true);
  });

  test('loadConfig reads existing config', async () => {
    const customConfig: XLoopConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'custom-model',
        claude: 'another-model'
      },
      commitPrefix: 'custom'
    };
    
    await saveConfig(customConfig);
    const loaded = await loadConfig();
    
    expect(loaded.defaultAgent).toBe('opencode');
    expect(loaded.models.opencode).toBe('custom-model');
    expect(loaded.commitPrefix).toBe('custom');
  });

  test('saveConfig writes config correctly', async () => {
    const config: XLoopConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'test-model',
        claude: 'test-claude'
      },
      commitPrefix: 'test'
    };
    
    await saveConfig(config);
    
    expect(existsSync(getConfigPath())).toBe(true);
    
    const loaded = await loadConfig();
    expect(loaded).toEqual(config);
  });

  test('getApiKey returns ANTHROPIC_API_KEY from env', () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    expect(getApiKey()).toBe('test-key-123');
    
    delete process.env.ANTHROPIC_API_KEY;
    expect(getApiKey()).toBeUndefined();
    
    // Restore
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });
});
