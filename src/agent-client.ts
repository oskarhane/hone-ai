/**
 * Agent Client - Abstraction layer for agent communication
 * Mirrors Anthropic SDK API but routes through agent subprocess spawning
 */

import { spawnAgent } from './agent';
import { retryWithBackoff, parseAgentError, ErrorMessages, exitWithError, isNetworkError } from './errors';
import type { AgentType } from './config';

export interface AgentClientConfig {
  agent: AgentType;
  model?: string;
  workingDir?: string;
}

export interface AgentMessageRequest {
  model?: string;
  max_tokens?: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
}

export interface AgentMessageResponse {
  content: Array<{ type: 'text'; text: string }>;
}

/**
 * Agent Client that mirrors Anthropic SDK API
 * Routes message creation through agent subprocess calls
 */
export class AgentClient {
  private config: AgentClientConfig;
  
  constructor(config: AgentClientConfig) {
    this.config = config;
  }
  
  /**
   * Messages API with create method
   * Mirrors Anthropic client.messages.create() interface
   */
  get messages() {
    return {
      create: async (request: AgentMessageRequest): Promise<AgentMessageResponse> => {
        // Use model from request, fall back to client config
        const model = request.model || this.config.model;
        
        // Construct prompt from request
        const prompt = constructPromptFromRequest(request);
        
        // Execute with retry logic for network errors only
        try {
          const result = await retryWithBackoff(async () => {
            const spawnResult = await spawnAgent({
              agent: this.config.agent,
              prompt,
              workingDir: this.config.workingDir || process.cwd(),
              model
            });
            
            // Only retry network errors, throw immediately for other failures
            if (spawnResult.exitCode !== 0) {
              // Parse error type from stderr
              const errorInfo = parseAgentError(spawnResult.stderr, spawnResult.exitCode);
              
              // Handle specific error types with user-friendly messages
              if (errorInfo.type === 'model_unavailable') {
                const { message, details } = ErrorMessages.MODEL_UNAVAILABLE(model || 'unknown', this.config.agent);
                exitWithError(message, details);
              } else if (errorInfo.type === 'rate_limit') {
                const { message, details } = ErrorMessages.RATE_LIMIT_ERROR(this.config.agent, errorInfo.retryAfter);
                exitWithError(message, details);
              } else if (errorInfo.type === 'spawn_failed') {
                const { message, details } = ErrorMessages.AGENT_SPAWN_FAILED(this.config.agent, spawnResult.stderr);
                exitWithError(message, details);
              }
              
              // For network errors, allow retry
              if (errorInfo.retryable) {
                throw new Error(`Agent exited with code ${spawnResult.exitCode}: ${spawnResult.stderr}`);
              }
              
              // For other unknown errors, provide generic agent error message
              const { message, details } = ErrorMessages.AGENT_ERROR(this.config.agent, spawnResult.exitCode, spawnResult.stderr);
              exitWithError(message, details);
            }
            
            return spawnResult;
          });
          
          // Parse response into Anthropic-compatible format
          return parseAgentResponse(result.stdout);
        } catch (error) {
          // Network errors that exhausted retries
          if (error instanceof Error && error.message.includes('Agent exited with code')) {
            const { message, details } = ErrorMessages.NETWORK_ERROR_FINAL(error);
            exitWithError(message, details);
          }
          throw error;
        }
      }
    };
  }
}

/**
 * Construct prompt from message request
 * Converts Anthropic message format to agent prompt string
 */
function constructPromptFromRequest(request: AgentMessageRequest): string {
  const parts: string[] = [];
  
  // Add system prompt if present
  if (request.system) {
    parts.push('# System');
    parts.push(request.system);
    parts.push('');
  }
  
  // Add conversation messages
  for (const message of request.messages) {
    if (message.role === 'user') {
      parts.push(message.content);
    } else {
      // Handle assistant messages (for multi-turn conversations)
      parts.push(`Previous response: ${message.content}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Parse agent stdout into Anthropic-compatible response format
 */
function parseAgentResponse(stdout: string): AgentMessageResponse {
  return {
    content: [{
      type: 'text',
      text: stdout.trim()
    }]
  };
}
