/**
 * Error handling utilities for hone
 */

export class HoneError extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = 'HoneError';
  }
}

/**
 * Format error message in hone style with ✗ symbol
 */
export function formatError(message: string, details?: string): string {
  let output = `✗ ${message}`;
  if (details) {
    output += `\n\n${details}`;
  }
  return output;
}

/**
 * Display error and exit
 * In test mode (NODE_ENV=test or BUN_ENV=test), throws instead of exiting
 */
export function exitWithError(message: string, details?: string): never {
  const fullMessage = formatError(message, details);
  
  // In test mode, throw instead of exit to allow testing
  if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
    throw new HoneError(fullMessage);
  }
  
  console.error(fullMessage);
  process.exit(1);
}

/**
 * Check if error is a network-related error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const err = error as any;
  const message = err.message?.toLowerCase() || '';
  const code = err.code?.toLowerCase() || '';
  
  // Common network error codes and messages
  const networkIndicators = [
    'econnrefused',
    'econnreset',
    'etimedout',
    'enotfound',
    'enetunreach',
    'network',
    'timeout',
    'fetch failed',
    'socket hang up'
  ];
  
  return networkIndicators.some(indicator => 
    message.includes(indicator) || code.includes(indicator)
  );
}

/**
 * Check if error indicates rate limiting
 */
export function isRateLimitError(errorText: string): boolean {
  const lowerError = errorText.toLowerCase();
  const rateLimitIndicators = [
    'rate limit',
    'rate_limit',
    'too many requests',
    '429',
    'quota exceeded',
    'rate exceeded'
  ];
  
  return rateLimitIndicators.some(indicator => lowerError.includes(indicator));
}

/**
 * Check if error indicates model unavailability
 */
export function isModelUnavailableError(errorText: string): boolean {
  const lowerError = errorText.toLowerCase();
  const modelErrorIndicators = [
    'model not found',
    'model unavailable',
    'model does not exist',
    'invalid model',
    'unknown model',
    '404',
    'not found'
  ];
  
  return modelErrorIndicators.some(indicator => lowerError.includes(indicator));
}

/**
 * Parse structured error information from agent stderr
 */
export interface AgentErrorInfo {
  type: 'network' | 'rate_limit' | 'model_unavailable' | 'spawn_failed' | 'unknown';
  retryable: boolean;
  retryAfter?: number;
}

export function parseAgentError(stderr: string, exitCode?: number): AgentErrorInfo {
  if (isNetworkError({ message: stderr })) {
    return { type: 'network', retryable: true };
  }
  
  if (isRateLimitError(stderr)) {
    // Try to extract retry-after time from stderr
    const retryMatch = stderr.match(/retry[- ]after[:\s]+(\d+)/i);
    const retryAfter = retryMatch && retryMatch[1] ? parseInt(retryMatch[1], 10) : undefined;
    return { type: 'rate_limit', retryable: false, retryAfter };
  }
  
  if (isModelUnavailableError(stderr)) {
    return { type: 'model_unavailable', retryable: false };
  }
  
  // Check for spawn-related failures (typically exit code undefined or ENOENT)
  if (exitCode === undefined || stderr.toLowerCase().includes('enoent')) {
    return { type: 'spawn_failed', retryable: false };
  }
  
  return { type: 'unknown', retryable: false };
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = isNetworkError
  } = options;

  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if not a network error or if we're out of retries
      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      
      console.error(`Network error, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Error messages for common scenarios
 */
export const ErrorMessages = {
  MISSING_API_KEY: {
    message: 'Error: ANTHROPIC_API_KEY not found',
    details: `Please create a .env file in your project root with:
ANTHROPIC_API_KEY=your-api-key-here

Get your API key at: https://console.anthropic.com/`
  },
  
  FILE_NOT_FOUND: (path: string) => ({
    message: `Error: File not found`,
    details: `Could not find file: ${path}

Please check the path and try again.`
  }),
  
  AGENT_NOT_FOUND: (agent: string) => ({
    message: `Error: ${agent} command not found`,
    details: agent === 'claude' 
      ? `Please install Claude Code CLI:
npm install -g @anthropic-ai/claude-code

Or visit: https://docs.anthropic.com/en/docs/claude-code`
      : `Please install OpenCode CLI:
npm install -g @opencode/cli

Or visit: https://opencode.ai/docs/installation`
  }),
  
  GIT_NOT_INITIALIZED: {
    message: 'Error: Git repository not initialized',
    details: `Please initialize git first:
git init`
  },
  
  INVALID_TASK_FILE: (path: string, reason: string) => ({
    message: 'Error: Invalid task file format',
    details: `File: ${path}
Reason: ${reason}

Please ensure the task file follows the correct YAML schema.`
  }),
  
  NETWORK_ERROR_FINAL: (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
      message: 'Error: Network request failed after retries',
      details: `Failed to connect to Anthropic API after multiple attempts.

Error: ${message}

Please check your internet connection and try again.`
    };
  },
  
  AGENT_SPAWN_FAILED: (agent: string, error: string) => ({
    message: `Error: Failed to start ${agent}`,
    details: `Could not spawn ${agent} agent process.

Error: ${error}

Please ensure ${agent} is properly installed and in your PATH.`
  }),
  
  MODEL_UNAVAILABLE: (model: string, agent: string) => ({
    message: `Error: Model not available`,
    details: `The model "${model}" is not available for agent "${agent}".

Please check:
  • Model name is correct (format: claude-<tier>-<version>-YYYYMMDD)
  • Model version is supported by ${agent} (check with: ${agent} --help)
  • Your ${agent} CLI is up to date

Supported tiers: sonnet, opus
Example: claude-sonnet-4-20250514`
  }),
  
  RATE_LIMIT_ERROR: (agent: string, retryAfter?: number) => {
    const retryMsg = retryAfter 
      ? `Please retry after ${retryAfter} seconds.`
      : 'Please wait a few minutes before retrying.';
    
    return {
      message: 'Error: Rate limit exceeded',
      details: `The ${agent} agent has exceeded its rate limit.

${retryMsg}

Consider:
  • Spacing out your requests
  • Using a different model if available
  • Checking your API usage dashboard`
    };
  },
  
  AGENT_ERROR: (agent: string, exitCode: number, stderr: string) => ({
    message: `Error: ${agent} agent failed`,
    details: `The ${agent} agent exited with code ${exitCode}.

Error output:
${stderr.trim() || '(no error output)'}

This may indicate:
  • Invalid prompt or parameters
  • Model configuration issue
  • Agent internal error

Review the error output above for specific details.`
  })
};
