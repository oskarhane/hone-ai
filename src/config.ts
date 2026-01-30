import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import * as yaml from 'js-yaml'
import { exitWithError, ErrorMessages } from './errors'

export interface HoneConfig {
  defaultAgent: 'opencode' | 'claude'
  models: {
    opencode: string
    claude: string
    // Phase-specific model overrides (optional)
    prd?: string
    prdToTasks?: string
    implement?: string
    review?: string
    finalize?: string
    agentsMd?: string
  }
  feedbackInstructions?: string
  lintCommand?: string
}

export const DEFAULT_AGENT: AgentType = 'claude'

const DEFAULT_CONFIG: HoneConfig = {
  defaultAgent: DEFAULT_AGENT,
  models: {
    opencode: 'claude-sonnet-4-20250514',
    claude: 'claude-sonnet-4-20250514',
  },
  feedbackInstructions: 'test: bun test',
  lintCommand: undefined,
}

export function getPlansDir(): string {
  return join(process.cwd(), '.plans')
}

export function ensurePlansDir(): void {
  const plansDir = getPlansDir()
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true })
  }
}

export function getConfigPath(): string {
  return join(getPlansDir(), 'hone.config.yml')
}

export async function loadConfig(): Promise<HoneConfig> {
  ensurePlansDir()

  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    await writeFile(configPath, yaml.dump(DEFAULT_CONFIG))
    return DEFAULT_CONFIG
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const config = yaml.load(content) as Partial<HoneConfig>
    // Deep merge models to preserve defaults
    return {
      ...DEFAULT_CONFIG,
      ...config,
      models: { ...DEFAULT_CONFIG.models, ...config.models },
    }
  } catch (error) {
    console.error('Error reading config, using defaults:', error)
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(config: HoneConfig): Promise<void> {
  ensurePlansDir()
  const configPath = getConfigPath()
  await writeFile(configPath, yaml.dump(config))
}

export type AgentType = 'opencode' | 'claude'

export function isValidAgent(agent: string): agent is AgentType {
  return agent === 'opencode' || agent === 'claude'
}

export async function resolveAgent(flagAgent?: string): Promise<AgentType> {
  // Priority: flag > config > default
  if (flagAgent) {
    if (!isValidAgent(flagAgent)) {
      exitWithError(
        'Error: Invalid agent',
        `Agent "${flagAgent}" is not valid. Must be "opencode" or "claude".`
      )
    }
    return flagAgent
  }

  const config = await loadConfig()
  return config.defaultAgent
}

export async function resolveAgentWithoutConfigCreation(flagAgent?: string): Promise<AgentType> {
  // Priority: flag > config (if exists) > default
  if (flagAgent) {
    if (!isValidAgent(flagAgent)) {
      exitWithError(
        'Error: Invalid agent',
        `Agent "${flagAgent}" is not valid. Must be "opencode" or "claude".`
      )
    }
    return flagAgent
  }

  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8')
      const config = yaml.load(content) as Partial<HoneConfig>
      return config.defaultAgent || DEFAULT_AGENT
    } catch (error) {
      console.error('Error reading config, using default agent:', error)
      return DEFAULT_AGENT
    }
  }

  return DEFAULT_AGENT
}

export async function loadConfigWithoutCreation(): Promise<HoneConfig> {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    // Return default config without creating the file
    return DEFAULT_CONFIG
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const config = yaml.load(content) as Partial<HoneConfig>
    // Deep merge models to preserve defaults
    return {
      ...DEFAULT_CONFIG,
      ...config,
      models: { ...DEFAULT_CONFIG.models, ...config.models },
    }
  } catch (error) {
    console.error('Error reading config, using defaults:', error)
    return DEFAULT_CONFIG
  }
}

export interface InitResult {
  plansCreated: boolean
  configCreated: boolean
}

export async function initProject(): Promise<InitResult> {
  const plansDir = getPlansDir()
  const configPath = getConfigPath()

  const plansExisted = existsSync(plansDir)
  const configExisted = existsSync(configPath)

  // Ensure .plans directory exists
  if (!plansExisted) {
    mkdirSync(plansDir, { recursive: true })
  }

  // Create config file if it doesn't exist
  if (!configExisted) {
    await writeFile(configPath, yaml.dump(DEFAULT_CONFIG))
  }

  return {
    plansCreated: !plansExisted,
    configCreated: !configExisted,
  }
}

export type ModelPhase = 'prd' | 'prdToTasks' | 'implement' | 'review' | 'finalize' | 'agentsMd'

/**
 * Resolve the model to use for a specific phase.
 * Priority: phase-specific model > agent-specific model > default model
 */
export function resolveModelForPhase(
  config: HoneConfig,
  phase?: ModelPhase,
  agent?: AgentType
): string {
  const resolvedAgent = agent || config.defaultAgent

  // 1. Check phase-specific model override
  if (phase && config.models[phase]) {
    return config.models[phase]!
  }

  // 2. Fall back to agent-specific model
  if (config.models[resolvedAgent]) {
    return config.models[resolvedAgent]
  }

  // 3. Fall back to default model
  return 'claude-sonnet-4-20250514'
}

/**
 * Validate configuration for phase-specific models.
 * Ensures model names follow the correct format.
 */
export function validateConfig(config: HoneConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const modelRegex = /^claude-(sonnet|opus)-\d+-\d{8}$/

  // Validate agent-specific models
  if (config.models.opencode && !modelRegex.test(config.models.opencode)) {
    errors.push(`Invalid model format for opencode: ${config.models.opencode}`)
  }

  if (config.models.claude && !modelRegex.test(config.models.claude)) {
    errors.push(`Invalid model format for claude: ${config.models.claude}`)
  }

  // Validate phase-specific models if present
  const phases: ModelPhase[] = ['prd', 'prdToTasks', 'implement', 'review', 'finalize', 'agentsMd']
  for (const phase of phases) {
    const model = config.models[phase]
    if (model && !modelRegex.test(model)) {
      errors.push(`Invalid model format for phase ${phase}: ${model}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
