import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import * as yaml from 'js-yaml'
import { exitWithError } from './errors'

export type AgentType = 'opencode' | 'claude'

export type ModelPhase =
  | 'prd'
  | 'prdToTasks'
  | 'implement'
  | 'review'
  | 'finalize'
  | 'agentsMd'
  | 'extendPrd'

export interface AgentModelConfig {
  model?: string
  models?: Partial<Record<ModelPhase, string>>
}

export interface HoneConfig {
  version: 2
  agent: AgentType
  claude: AgentModelConfig
  opencode: AgentModelConfig
  lintCommand?: string
  agentsDocsDir?: string
}

// LegacyConfig represents v1 config shape (no version field)
interface LegacyConfig {
  defaultAgent?: 'opencode' | 'claude'
  models?: {
    opencode?: string
    claude?: string
    prd?: string
    prdToTasks?: string
    implement?: string
    review?: string
    finalize?: string
    agentsMd?: string
    extendPrd?: string
  }
  lintCommand?: string
  agentsDocsDir?: string
}

export const DEFAULT_AGENT: AgentType = 'claude'

const DEFAULT_CONFIG: HoneConfig = {
  version: 2,
  agent: DEFAULT_AGENT,
  claude: { models: {} },
  opencode: { models: {} },
  lintCommand: undefined,
  agentsDocsDir: '.agents/',
}

const PHASE_KEYS: ModelPhase[] = [
  'prd',
  'prdToTasks',
  'implement',
  'review',
  'finalize',
  'agentsMd',
  'extendPrd',
]

export function migrateV1ToV2(v1: LegacyConfig): HoneConfig {
  const agent: AgentType = (v1.defaultAgent as AgentType) || DEFAULT_AGENT
  const claudeModel = v1.models?.claude
  const opencodeModel = v1.models?.opencode

  // Phase keys go into defaultAgent's models block only
  const agentModels: Partial<Record<ModelPhase, string>> = {}
  for (const phase of PHASE_KEYS) {
    const phaseModel = v1.models?.[phase as keyof typeof v1.models]
    if (phaseModel) agentModels[phase] = phaseModel
  }

  const claude: AgentModelConfig = {
    models: agent === 'claude' ? agentModels : {},
    ...(claudeModel ? { model: claudeModel } : {}),
  }
  const opencode: AgentModelConfig = {
    models: agent === 'opencode' ? agentModels : {},
    ...(opencodeModel ? { model: opencodeModel } : {}),
  }

  return {
    version: 2,
    agent,
    claude,
    opencode,
    ...(v1.lintCommand !== undefined ? { lintCommand: v1.lintCommand } : {}),
    ...(v1.agentsDocsDir !== undefined ? { agentsDocsDir: v1.agentsDocsDir } : {}),
  }
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
    const raw = yaml.load(content) as Partial<HoneConfig> & LegacyConfig
    if (!raw.version) {
      // v1 config: migrate to v2 and write back to disk
      const migrated = migrateV1ToV2(raw)
      await writeFile(configPath, yaml.dump(migrated))
      return migrated
    }
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      claude: { ...DEFAULT_CONFIG.claude, ...raw.claude },
      opencode: { ...DEFAULT_CONFIG.opencode, ...raw.opencode },
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
  return config.agent
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
      return config.agent || DEFAULT_AGENT
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
    const raw = yaml.load(content) as Partial<HoneConfig> & LegacyConfig
    if (!raw.version) {
      // v1 config: migrate in-memory only (no disk write)
      return migrateV1ToV2(raw)
    }
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      claude: { ...DEFAULT_CONFIG.claude, ...raw.claude },
      opencode: { ...DEFAULT_CONFIG.opencode, ...raw.opencode },
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

const HARDCODED_DEFAULT_CLAUDE = 'claude-sonnet-4-6'
const HARDCODED_DEFAULT_OPENCODE = 'anthropic/claude-sonnet-4-6'

/**
 * Resolve the model to use for a specific phase.
 * Priority: phase-specific model (in agent block) > agent model > hardcoded default
 */
export function resolveModelForPhase(
  config: HoneConfig,
  phase?: ModelPhase,
  agent?: AgentType
): string {
  const resolvedAgent = agent || config.agent
  const agentConfig = config[resolvedAgent]

  // 1. Check phase-specific model in agent's models block
  if (phase && agentConfig?.models?.[phase]) {
    return agentConfig.models[phase]!
  }

  // 2. Fall back to agent-specific model
  if (agentConfig?.model) {
    return agentConfig.model
  }

  // 3. Fall back to hardcoded default for the agent
  return resolvedAgent === 'claude' ? HARDCODED_DEFAULT_CLAUDE : HARDCODED_DEFAULT_OPENCODE
}

/**
 * Validate configuration for agent-specific and phase-specific models.
 * Ensures model names follow the correct format.
 */
export function validateConfig(config: HoneConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  // Multi-provider model validation: supports OpenAI, Anthropic, Google formats + legacy Claude format
  const modelRegex = /^(?:(?:openai|anthropic|google)\/[\w.-]+|claude-(?:sonnet|opus)-[\d.-]+)$/

  // Validate claude block
  if (config.claude.model && !modelRegex.test(config.claude.model)) {
    errors.push(
      `Invalid model format for claude: ${config.claude.model}. Expected format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-sonnet-4) or legacy claude-(sonnet|opus)-N-YYYYMMDD`
    )
  }
  for (const [phase, model] of Object.entries(config.claude.models ?? {})) {
    if (model && !modelRegex.test(model)) {
      errors.push(
        `Invalid model format for claude/${phase}: ${model}. Expected format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-sonnet-4) or legacy claude-(sonnet|opus)-N-YYYYMMDD`
      )
    }
  }

  // Validate opencode block
  if (config.opencode.model && !modelRegex.test(config.opencode.model)) {
    errors.push(
      `Invalid model format for opencode: ${config.opencode.model}. Expected format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-sonnet-4) or legacy claude-(sonnet|opus)-N-YYYYMMDD`
    )
  }
  for (const [phase, model] of Object.entries(config.opencode.models ?? {})) {
    if (model && !modelRegex.test(model)) {
      errors.push(
        `Invalid model format for opencode/${phase}: ${model}. Expected format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-sonnet-4) or legacy claude-(sonnet|opus)-N-YYYYMMDD`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
