/**
 * Error handling utilities for xloop
 */

export class XLoopError extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = 'XLoopError';
  }
}

/**
 * Format error message in xloop style with ✗ symbol
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
    throw new XLoopError(fullMessage);
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
  }
};
