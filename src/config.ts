import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { exitWithError, ErrorMessages } from './errors';

export interface XLoopConfig {
  defaultAgent: 'opencode' | 'claude';
  models: {
    opencode: string;
    claude: string;
  };
  commitPrefix: string;
  feedbackCommand?: string;
  lintCommand?: string;
}

const DEFAULT_CONFIG: XLoopConfig = {
  defaultAgent: 'claude',
  models: {
    opencode: 'claude-sonnet-4-20250514',
    claude: 'claude-sonnet-4-20250514'
  },
  commitPrefix: 'xloop',
  feedbackCommand: 'bun test',
  lintCommand: undefined
};

export function getPlansDir(): string {
  return join(process.cwd(), '.plans');
}

export function ensurePlansDir(): void {
  const plansDir = getPlansDir();
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true });
  }
}

export function getConfigPath(): string {
  return join(getPlansDir(), 'xloop.config.json');
}

export async function loadConfig(): Promise<XLoopConfig> {
  ensurePlansDir();
  
  const configPath = getConfigPath();
  
  if (!existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  
  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error('Error reading config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: XLoopConfig): Promise<void> {
  ensurePlansDir();
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function validateApiKey(): void {
  const apiKey = getApiKey();
  if (!apiKey) {
    const { message, details } = ErrorMessages.MISSING_API_KEY;
    exitWithError(message, details);
  }
}

export type AgentType = 'opencode' | 'claude';

export function isValidAgent(agent: string): agent is AgentType {
  return agent === 'opencode' || agent === 'claude';
}

export async function resolveAgent(flagAgent?: string): Promise<AgentType> {
  // Priority: flag > config > default
  if (flagAgent) {
    if (!isValidAgent(flagAgent)) {
      exitWithError(
        'Error: Invalid agent',
        `Agent "${flagAgent}" is not valid. Must be "opencode" or "claude".`
      );
    }
    return flagAgent;
  }
  
  const config = await loadConfig();
  return config.defaultAgent;
}
