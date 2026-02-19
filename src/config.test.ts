import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test'
import { existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
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
  type HoneConfig,
} from './config'

// Set test environment
const originalEnv = process.env.BUN_ENV
beforeAll(() => {
  process.env.BUN_ENV = 'test'
})
afterAll(() => {
  process.env.BUN_ENV = originalEnv
})

const TEST_CWD = join(process.cwd(), 'test-workspace')

describe('Config Management', () => {
  beforeEach(() => {
    // Create test workspace
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true })
    }
    mkdirSync(TEST_CWD, { recursive: true })
    process.chdir(TEST_CWD)
  })

  afterEach(() => {
    // Cleanup
    process.chdir(join(TEST_CWD, '..'))
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true })
    }
  })

  test('getPlansDir returns correct path', () => {
    const plansDir = getPlansDir()
    expect(plansDir).toBe(join(TEST_CWD, '.plans'))
  })

  test('ensurePlansDir creates directory if not exists', () => {
    const plansDir = getPlansDir()
    expect(existsSync(plansDir)).toBe(false)

    ensurePlansDir()

    expect(existsSync(plansDir)).toBe(true)
  })

  test('ensurePlansDir is idempotent', () => {
    ensurePlansDir()
    ensurePlansDir() // Should not throw
    expect(existsSync(getPlansDir())).toBe(true)
  })

  test('loadConfig creates default config if not exists', async () => {
    const config = await loadConfig()

    expect(config.defaultAgent).toBe('claude')
    expect(config.models.opencode).toBe('openai/gpt-5.2-codex')
    expect(config.models.claude).toBe('anthropic/claude-sonnet-4-5')

    // Verify file was created
    expect(existsSync(getConfigPath())).toBe(true)
  })

  test('loadConfig reads existing config', async () => {
    const customConfig: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'custom-model',
        claude: 'another-model',
      },
    }

    await saveConfig(customConfig)
    const loaded = await loadConfig()

    expect(loaded.defaultAgent).toBe('opencode')
    expect(loaded.models.opencode).toBe('custom-model')
  })

  test('saveConfig writes config correctly', async () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'test-opencode',
        claude: 'test-claude',
      },
      lintCommand: 'npm run lint',
    }

    await saveConfig(config)

    expect(existsSync(getConfigPath())).toBe(true)

    const loaded = await loadConfig()
    expect(loaded).toEqual(config)
  })

  test('isValidAgent returns true for valid agents', () => {
    expect(isValidAgent('opencode')).toBe(true)
    expect(isValidAgent('claude')).toBe(true)
  })

  test('isValidAgent returns false for invalid agents', () => {
    expect(isValidAgent('invalid')).toBe(false)
    expect(isValidAgent('gpt4')).toBe(false)
    expect(isValidAgent('')).toBe(false)
  })

  test('resolveAgent prioritizes flag over config', async () => {
    // Set config default to claude
    await saveConfig({
      defaultAgent: 'claude',
      models: { opencode: 'test', claude: 'test' },
    })

    // Flag should override
    const agent = await resolveAgent('opencode')
    expect(agent).toBe('opencode')
  })

  test('resolveAgent uses config when no flag provided', async () => {
    // Set config default to opencode
    await saveConfig({
      defaultAgent: 'opencode',
      models: { opencode: 'test', claude: 'test' },
    })

    const agent = await resolveAgent()
    expect(agent).toBe('opencode')
  })

  test('resolveAgent uses default when no flag and no config', async () => {
    // Don't create config, should use default
    const agent = await resolveAgent()
    expect(agent).toBe('claude') // Default from DEFAULT_CONFIG
  })

  test('initProject creates .plans directory and config file', async () => {
    const plansDir = getPlansDir()
    const configPath = getConfigPath()

    expect(existsSync(plansDir)).toBe(false)
    expect(existsSync(configPath)).toBe(false)

    const result = await initProject()

    expect(result.plansCreated).toBe(true)
    expect(result.configCreated).toBe(true)
    expect(existsSync(plansDir)).toBe(true)
    expect(existsSync(configPath)).toBe(true)
  })

  test('initProject is idempotent when already initialized', async () => {
    // First init
    await initProject()

    // Second init
    const result = await initProject()

    expect(result.plansCreated).toBe(false)
    expect(result.configCreated).toBe(false)
    expect(existsSync(getPlansDir())).toBe(true)
    expect(existsSync(getConfigPath())).toBe(true)
  })

  test('initProject creates only missing parts', async () => {
    // Create .plans directory manually
    ensurePlansDir()

    const result = await initProject()

    expect(result.plansCreated).toBe(false)
    expect(result.configCreated).toBe(true)
    expect(existsSync(getConfigPath())).toBe(true)
  })
})

describe('Model Resolution', () => {
  test('resolveModelForPhase returns default model when no phase specified', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const model = resolveModelForPhase(config)
    expect(model).toBe('claude-sonnet-4-20250514')
  })

  test('resolveModelForPhase returns phase-specific model when configured', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'claude-opus-4-20250514',
      },
    }

    const model = resolveModelForPhase(config, 'implement')
    expect(model).toBe('claude-opus-4-20250514')
  })

  test('resolveModelForPhase falls back to agent-specific model', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'custom-opencode-model',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const model = resolveModelForPhase(config, 'implement', 'opencode')
    expect(model).toBe('custom-opencode-model')
  })

  test('resolveModelForPhase prioritizes phase-specific over agent-specific', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'opencode-default',
        claude: 'claude-default',
        review: 'review-specific-model',
      },
    }

    const model = resolveModelForPhase(config, 'review', 'opencode')
    expect(model).toBe('review-specific-model')
  })

  test('resolveModelForPhase uses defaultAgent when agent not specified', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'opencode-model',
        claude: 'claude-model',
      },
    }

    const model = resolveModelForPhase(config, 'prd')
    expect(model).toBe('opencode-model')
  })

  test('resolveModelForPhase returns default when phase and agent models missing', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: '',
        claude: '',
      },
    }

    const model = resolveModelForPhase(config, 'finalize')
    expect(model).toBe('anthropic/claude-sonnet-4-5')
  })

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
        finalize: 'final-model',
        agentsMd: 'agents-model',
        extendPrd: 'extend-model',
      },
    }

    expect(resolveModelForPhase(config, 'prd')).toBe('prd-model')
    expect(resolveModelForPhase(config, 'prdToTasks')).toBe('tasks-model')
    expect(resolveModelForPhase(config, 'implement')).toBe('impl-model')
    expect(resolveModelForPhase(config, 'review')).toBe('review-model')
    expect(resolveModelForPhase(config, 'finalize')).toBe('final-model')
    expect(resolveModelForPhase(config, 'agentsMd')).toBe('agents-model')
    expect(resolveModelForPhase(config, 'extendPrd')).toBe('extend-model')
  })

  test('resolveModelForPhase returns extendPrd specific model when configured', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        extendPrd: 'claude-opus-4-20250514',
      },
    }

    const model = resolveModelForPhase(config, 'extendPrd')
    expect(model).toBe('claude-opus-4-20250514')
  })

  test('resolveModelForPhase falls back to prd phase model for extendPrd', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        prd: 'claude-opus-4-20250514',
        // No extendPrd specific model
      },
    }

    // extendPrd should fall back to agent model, not prd phase
    // (phase fallback is handled at application level, not in resolveModelForPhase)
    const model = resolveModelForPhase(config, 'extendPrd')
    expect(model).toBe('claude-sonnet-4-20250514')
  })

  // OpenAI model resolution tests - agent-specific configurations
  test('resolveModelForPhase returns OpenAI model for opencode agent', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const model = resolveModelForPhase(config)
    expect(model).toBe('openai/gpt-4o')
  })

  test('resolveModelForPhase returns OpenAI model for claude agent', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'openai/gpt-4',
      },
    }

    const model = resolveModelForPhase(config)
    expect(model).toBe('openai/gpt-4')
  })

  test('resolveModelForPhase handles mixed OpenAI and Claude agent models - opencode', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const modelOpencode = resolveModelForPhase(config, undefined, 'opencode')
    const modelClaude = resolveModelForPhase(config, undefined, 'claude')

    expect(modelOpencode).toBe('openai/gpt-4o')
    expect(modelClaude).toBe('claude-sonnet-4-20250514')
  })

  test('resolveModelForPhase handles mixed OpenAI and Claude agent models - claude default', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const modelDefault = resolveModelForPhase(config)
    const modelExplicitClaude = resolveModelForPhase(config, undefined, 'claude')
    const modelExplicitOpencode = resolveModelForPhase(config, undefined, 'opencode')

    expect(modelDefault).toBe('claude-sonnet-4-20250514')
    expect(modelExplicitClaude).toBe('claude-sonnet-4-20250514')
    expect(modelExplicitOpencode).toBe('openai/gpt-4o')
  })

  test('resolveModelForPhase returns OpenAI model unchanged when no phase specified', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-5.3-codex',
        claude: 'openai/gpt-4o-mini',
      },
    }

    const modelOpencode = resolveModelForPhase(config, undefined, 'opencode')
    const modelClaude = resolveModelForPhase(config, undefined, 'claude')

    expect(modelOpencode).toBe('openai/gpt-5.3-codex')
    expect(modelClaude).toBe('openai/gpt-4o-mini')
  })

  test('resolveModelForPhase uses OpenAI agent model when phase not configured', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const model = resolveModelForPhase(config, 'implement')
    expect(model).toBe('openai/gpt-4o')
  })

  test('resolveModelForPhase falls back to OpenAI model when phase-specific not set', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'openai/gpt-4',
        // No phase-specific models
      },
    }

    const modelPrd = resolveModelForPhase(config, 'prd')
    const modelImplement = resolveModelForPhase(config, 'implement')
    const modelReview = resolveModelForPhase(config, 'review')

    expect(modelPrd).toBe('openai/gpt-4')
    expect(modelImplement).toBe('openai/gpt-4')
    expect(modelReview).toBe('openai/gpt-4')
  })

  // Phase-specific OpenAI model override tests
  test('resolveModelForPhase prioritizes phase-specific OpenAI model over agent model', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-opus-4-20250514',
        implement: 'openai/gpt-4o',
      },
    }

    const model = resolveModelForPhase(config, 'implement')
    expect(model).toBe('openai/gpt-4o')
  })

  test('resolveModelForPhase returns all phase-specific OpenAI models correctly', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        prd: 'openai/gpt-4o',
        prdToTasks: 'openai/gpt-4-turbo',
        implement: 'openai/gpt-5.3-codex',
        review: 'openai/gpt-4o-mini',
        finalize: 'openai/gpt-4',
        agentsMd: 'openai/gpt-4o',
        extendPrd: 'openai/gpt-4-turbo',
      },
    }

    expect(resolveModelForPhase(config, 'prd')).toBe('openai/gpt-4o')
    expect(resolveModelForPhase(config, 'prdToTasks')).toBe('openai/gpt-4-turbo')
    expect(resolveModelForPhase(config, 'implement')).toBe('openai/gpt-5.3-codex')
    expect(resolveModelForPhase(config, 'review')).toBe('openai/gpt-4o-mini')
    expect(resolveModelForPhase(config, 'finalize')).toBe('openai/gpt-4')
    expect(resolveModelForPhase(config, 'agentsMd')).toBe('openai/gpt-4o')
    expect(resolveModelForPhase(config, 'extendPrd')).toBe('openai/gpt-4-turbo')
  })

  test('resolveModelForPhase handles mixed OpenAI and Claude in phase-specific configs', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        prd: 'openai/gpt-4o',
        implement: 'claude-opus-4-20250514',
        review: 'openai/gpt-4-turbo',
        finalize: 'claude-sonnet-4-20250514',
      },
    }

    expect(resolveModelForPhase(config, 'prd')).toBe('openai/gpt-4o')
    expect(resolveModelForPhase(config, 'implement')).toBe('claude-opus-4-20250514')
    expect(resolveModelForPhase(config, 'review')).toBe('openai/gpt-4-turbo')
    expect(resolveModelForPhase(config, 'finalize')).toBe('claude-sonnet-4-20250514')
  })

  test('resolveModelForPhase phase-specific OpenAI model overrides OpenAI agent model', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4',
        claude: 'claude-sonnet-4-20250514',
        prd: 'openai/gpt-4o',
      },
    }

    const modelPrd = resolveModelForPhase(config, 'prd')
    const modelImplement = resolveModelForPhase(config, 'implement')

    expect(modelPrd).toBe('openai/gpt-4o')
    expect(modelImplement).toBe('openai/gpt-4')
  })

  test('resolveModelForPhase falls back to OpenAI agent model when phase not configured', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
        prd: 'openai/gpt-4-turbo',
        // implement not configured
      },
    }

    const modelPrd = resolveModelForPhase(config, 'prd')
    const modelImplement = resolveModelForPhase(config, 'implement')

    expect(modelPrd).toBe('openai/gpt-4-turbo')
    expect(modelImplement).toBe('openai/gpt-4o')
  })

  test('resolveModelForPhase with explicit agent parameter respects phase-specific OpenAI model', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
        implement: 'openai/gpt-5.3-codex',
      },
    }

    const modelDefaultAgent = resolveModelForPhase(config, 'implement')
    const modelExplicitClaude = resolveModelForPhase(config, 'implement', 'claude')

    expect(modelDefaultAgent).toBe('openai/gpt-5.3-codex')
    expect(modelExplicitClaude).toBe('openai/gpt-5.3-codex')
  })

  test('resolveModelForPhase with mixed providers - phase overrides agent', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
        review: 'anthropic/claude-sonnet-4',
        finalize: 'google/gemini-pro',
      },
    }

    expect(resolveModelForPhase(config, 'review')).toBe('anthropic/claude-sonnet-4')
    expect(resolveModelForPhase(config, 'finalize')).toBe('google/gemini-pro')
    expect(resolveModelForPhase(config, 'implement')).toBe('claude-sonnet-4-20250514')
  })
})

describe('Config Validation', () => {
  test('validateConfig accepts valid model formats', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-opus-4-20251231',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts valid phase-specific models', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'claude-opus-4-20250601',
        review: 'claude-sonnet-4-20250701',
        extendPrd: 'claude-opus-4-20250801',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig validates extendPrd phase model format', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        extendPrd: 'invalid-extend-model',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('extendPrd')
    expect(result.errors[0]).toContain('invalid-extend-model')
  })

  test('validateConfig rejects invalid agent model format', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'invalid-model',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('opencode')
    expect(result.errors[0]).toContain('invalid-model')
  })

  test('validateConfig rejects invalid phase model format', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'wrong-format',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('implement')
  })

  test('validateConfig handles multiple invalid models', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'bad-opencode',
        claude: 'bad-claude',
        implement: 'bad-implement',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(3)
  })

  test('validateConfig allows empty phase-specific models', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        // No phase-specific models
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  // OpenAI model validation tests
  test('validateConfig accepts valid OpenAI model for opencode agent', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts valid OpenAI model for claude agent', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'openai/gpt-4',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models with version numbers', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-5.3-codex',
        claude: 'openai/gpt-4o-mini',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts mixed OpenAI and Claude agent models', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - prd', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        prd: 'openai/gpt-4o',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - implement', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'openai/gpt-4o',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - review', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        review: 'openai/gpt-4-turbo',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - finalize', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        finalize: 'openai/gpt-5.3-codex',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - prdToTasks', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        prdToTasks: 'openai/gpt-4o',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - agentsMd', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        agentsMd: 'openai/gpt-4o',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts OpenAI models in phase-specific config - extendPrd', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        extendPrd: 'openai/gpt-4o',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts mixed OpenAI and Claude in phase-specific configs', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        prd: 'openai/gpt-4o',
        implement: 'claude-opus-4-20250514',
        review: 'openai/gpt-4-turbo',
        finalize: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig rejects invalid OpenAI model format - missing model name', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('opencode')
    expect(result.errors[0]).toContain('openai/')
  })

  test('validateConfig rejects invalid OpenAI model format - missing provider', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: '/gpt-4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('opencode')
    expect(result.errors[0]).toContain('/gpt-4o')
  })

  test('validateConfig rejects invalid OpenAI model format - spaces in model name', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'openai/gpt 4o',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('opencode')
    expect(result.errors[0]).toContain('openai/gpt 4o')
  })

  test('validateConfig rejects unknown provider prefix', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'mistral/mixtral-8x7b',
        claude: 'claude-sonnet-4-20250514',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('opencode')
    expect(result.errors[0]).toContain('mistral/mixtral-8x7b')
  })

  test('validateConfig rejects invalid OpenAI model in phase-specific config', () => {
    const config: HoneConfig = {
      defaultAgent: 'claude',
      models: {
        opencode: 'claude-sonnet-4-20250514',
        claude: 'claude-sonnet-4-20250514',
        implement: 'openai/invalid model name',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('implement')
    expect(result.errors[0]).toContain('openai/invalid model name')
  })

  test('validateConfig accepts other provider formats - anthropic', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'anthropic/claude-sonnet-4',
        claude: 'anthropic/claude-opus-4',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateConfig accepts other provider formats - google', () => {
    const config: HoneConfig = {
      defaultAgent: 'opencode',
      models: {
        opencode: 'google/gemini-pro',
        claude: 'google/gemini-1.5-flash',
      },
    }

    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  // Backward compatibility tests for existing Claude model configurations
  describe('Backward Compatibility with Existing Claude Configurations', () => {
    test('validateConfig accepts existing Claude sonnet model format', () => {
      const config: HoneConfig = {
        defaultAgent: 'claude',
        models: {
          opencode: 'claude-sonnet-4-20250514',
          claude: 'claude-sonnet-4-20250514',
        },
      }

      const result = validateConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    test('validateConfig accepts existing Claude opus model format', () => {
      const config: HoneConfig = {
        defaultAgent: 'claude',
        models: {
          opencode: 'claude-opus-4-20251231',
          claude: 'claude-opus-4-20251231',
        },
      }

      const result = validateConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    test('validateConfig accepts existing phase-specific Claude models unchanged', () => {
      const config: HoneConfig = {
        defaultAgent: 'claude',
        models: {
          opencode: 'claude-sonnet-4-20250514',
          claude: 'claude-sonnet-4-20250514',
          prd: 'claude-opus-4-20250601',
          prdToTasks: 'claude-sonnet-4-20250701',
          implement: 'claude-opus-4-20250801',
          review: 'claude-sonnet-4-20250901',
          finalize: 'claude-opus-4-20251001',
          agentsMd: 'claude-sonnet-4-20251101',
          extendPrd: 'claude-opus-4-20251201',
        },
      }

      const result = validateConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    test('resolveModelForPhase works with existing Claude model configs', () => {
      const config: HoneConfig = {
        defaultAgent: 'claude',
        models: {
          opencode: 'claude-sonnet-4-20250514',
          claude: 'claude-sonnet-4-20250514',
          implement: 'claude-opus-4-20250601',
        },
      }

      expect(resolveModelForPhase(config)).toBe('claude-sonnet-4-20250514')
      expect(resolveModelForPhase(config, 'implement')).toBe('claude-opus-4-20250601')
      expect(resolveModelForPhase(config, 'review')).toBe('claude-sonnet-4-20250514')
      expect(resolveModelForPhase(config, 'prd', 'opencode')).toBe('claude-sonnet-4-20250514')
    })

    test('DEFAULT_CONFIG uses valid provider model format', () => {
      const config: HoneConfig = {
        defaultAgent: 'claude',
        models: {
          opencode: 'openai/gpt-5.2-codex',
          claude: 'anthropic/claude-sonnet-4-5',
        },
      }

      const result = validateConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    test('Mixed Claude and OpenAI models maintain Claude model compatibility', () => {
      const config: HoneConfig = {
        defaultAgent: 'opencode',
        models: {
          opencode: 'openai/gpt-4o',
          claude: 'claude-sonnet-4-20250514',
          implement: 'claude-opus-4-20250601',
          review: 'openai/gpt-4',
        },
      }

      const result = validateConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)

      // Verify Claude models resolve correctly
      expect(resolveModelForPhase(config, 'implement')).toBe('claude-opus-4-20250601')
      expect(resolveModelForPhase(config, 'prd', 'claude')).toBe('claude-sonnet-4-20250514')
    })

    test('All existing Claude model formats remain valid without changes', () => {
      // Test various existing Claude model date formats that users might have
      const validClaudeModels = [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-sonnet-5-20260101',
        'claude-opus-5-20260101',
        'claude-sonnet-4-20251231',
        'claude-opus-4-20251231',
      ]

      for (const model of validClaudeModels) {
        const config: HoneConfig = {
          defaultAgent: 'claude',
          models: {
            opencode: model,
            claude: model,
          },
        }

        const result = validateConfig(config)
        expect(result.valid, `Model ${model} should be valid`).toBe(true)
        expect(result.errors.length, `Model ${model} should have no errors`).toBe(0)
      }
    })
  })
})
