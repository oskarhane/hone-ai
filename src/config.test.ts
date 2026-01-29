import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { 
  getPlansDir, 
  ensurePlansDir, 
  getConfigPath, 
  loadConfig, 
  saveConfig,
  isValidAgent,
  resolveAgent,
  initProject,
  resolveModelForPhase,
  validateConfig,
  type HoneConfig 
} from './config';

// Set test environment
const originalEnv = process.env.BUN_ENV;
beforeAll(() => {
  process.env.BUN_ENV = 'test';
});
afterAll(() => {
  process.env.BUN_ENV = originalEnv;
});

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
    expect(config.models.opencode).toBe('claude-sonnet-4-20250514');
    expect(config.models.claude).toBe('claude-sonnet-4-20250514');
    
    // Verify file was created
    expect(existsSync(getConfigPath())).toBe(true);
  });

  test('loadConfig reads existing config', async () => {
    const customConfig: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'custom-model',
        claude: 'another-model'
      }
    };
    
    await saveConfig(customConfig);
    const loaded = await loadConfig();
    
    expect(loaded.defaultAgent).toBe('opencode');
    expect(loaded.models.opencode).toBe('custom-model');
  });

  test('saveConfig writes config correctly', async () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'test-opencode',
        claude: 'test-claude'
      },
      feedbackInstructions: 'test: npm test, lint: npm run lint',
      lintCommand: 'npm run lint'
    };
    
    await saveConfig(config);
    
    expect(existsSync(getConfigPath())).toBe(true);
    
    const loaded = await loadConfig();
    expect(loaded).toEqual(config);
  });

  test('isValidAgent returns true for valid agents', () => {
    expect(isValidAgent('opencode')).toBe(true);
    expect(isValidAgent('claude')).toBe(true);
  });

  test('isValidAgent returns false for invalid agents', () => {
    expect(isValidAgent('invalid')).toBe(false);
    expect(isValidAgent('gpt4')).toBe(false);
    expect(isValidAgent('')).toBe(false);
  });

  test('resolveAgent prioritizes flag over config', async () => {
    // Set config default to claude
    await saveConfig({
      defaultAgent: 'claude',
      models: { opencode: 'test', claude: 'test' },

    });
    
    // Flag should override
    const agent = await resolveAgent('opencode');
    expect(agent).toBe('opencode');
  });

  test('resolveAgent uses config when no flag provided', async () => {
    // Set config default to opencode
    await saveConfig({
      defaultAgent: 'opencode',
      models: { opencode: 'test', claude: 'test' },

    });
    
    const agent = await resolveAgent();
    expect(agent).toBe('opencode');
  });

  test('resolveAgent uses default when no flag and no config', async () => {
    // Don't create config, should use default
    const agent = await resolveAgent();
    expect(agent).toBe('claude'); // Default from DEFAULT_CONFIG
  });

  test('initProject creates .plans directory and config file', async () => {
    const plansDir = getPlansDir();
    const configPath = getConfigPath();
    
    expect(existsSync(plansDir)).toBe(false);
    expect(existsSync(configPath)).toBe(false);
    
    const result = await initProject();
    
    expect(result.plansCreated).toBe(true);
    expect(result.configCreated).toBe(true);
    expect(existsSync(plansDir)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
  });

  test('initProject is idempotent when already initialized', async () => {
    // First init
    await initProject();
    
    // Second init
    const result = await initProject();
    
    expect(result.plansCreated).toBe(false);
    expect(result.configCreated).toBe(false);
    expect(existsSync(getPlansDir())).toBe(true);
    expect(existsSync(getConfigPath())).toBe(true);
  });

  test('initProject creates only missing parts', async () => {
    // Create .plans directory manually
    ensurePlansDir();
    
    const result = await initProject();
    
    expect(result.plansCreated).toBe(false);
    expect(result.configCreated).toBe(true);
    expect(existsSync(getConfigPath())).toBe(true);
  });
});

describe('Model Resolution', () => {
  test('resolveModelForPhase returns default model when no phase specified', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514'
      }

    };
    
    const model = resolveModelForPhase(config);
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  test('resolveModelForPhase returns phase-specific model when configured', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'claude-opus-4-20250514'
      }

    };
    
    const model = resolveModelForPhase(config, 'implement');
    expect(model).toBe('claude-opus-4-20250514');
  });

  test('resolveModelForPhase falls back to agent-specific model', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'custom-opencode-model',
        claude: 'claude-sonnet-4-20250514'
      }

    };
    
    const model = resolveModelForPhase(config, 'implement', 'opencode');
    expect(model).toBe('custom-opencode-model');
  });

  test('resolveModelForPhase prioritizes phase-specific over agent-specific', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'opencode-default',
        claude: 'claude-default',
        review: 'review-specific-model'
      }

    };
    
    const model = resolveModelForPhase(config, 'review', 'opencode');
    expect(model).toBe('review-specific-model');
  });

  test('resolveModelForPhase uses defaultAgent when agent not specified', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'opencode-model',
        claude: 'claude-model'
      }

    };
    
    const model = resolveModelForPhase(config, 'prd');
    expect(model).toBe('opencode-model');
  });

  test('resolveModelForPhase returns default when phase and agent models missing', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: '',
        claude: ''
      }

    };
    
    const model = resolveModelForPhase(config, 'finalize');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  test('resolveModelForPhase handles all phase types', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'base-model',
        claude: 'base-model',
        prd: 'prd-model',
        prdToTasks: 'tasks-model',
        implement: 'impl-model',
        review: 'review-model',
        finalize: 'final-model'
      }

    };
    
    expect(resolveModelForPhase(config, 'prd')).toBe('prd-model');
    expect(resolveModelForPhase(config, 'prdToTasks')).toBe('tasks-model');
    expect(resolveModelForPhase(config, 'implement')).toBe('impl-model');
    expect(resolveModelForPhase(config, 'review')).toBe('review-model');
    expect(resolveModelForPhase(config, 'finalize')).toBe('final-model');
  });
});

describe('Config Validation', () => {
  test('validateConfig accepts valid model formats', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-opus-4-20251231'
      }

    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('validateConfig accepts valid phase-specific models', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'claude-opus-4-20250601',
        review: 'claude-sonnet-4-20250701'
      }

    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('validateConfig rejects invalid agent model format', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'invalid-model',
        claude: 'claude-sonnet-4-20250514'
      }

    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('opencode');
    expect(result.errors[0]).toContain('invalid-model');
  });

  test('validateConfig rejects invalid phase model format', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'wrong-format'
      }

    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('implement');
  });

  test('validateConfig handles multiple invalid models', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'bad-opencode',
        claude: 'bad-claude',
        implement: 'bad-implement'
      }

    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  test('validateConfig allows empty phase-specific models', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514'
        // No phase-specific models
      }

    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
