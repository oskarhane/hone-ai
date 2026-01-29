/**
 * Agent Client - Abstraction layer for agent communication
 * Mirrors Anthropic SDK API but routes through agent subprocess spawning
 */

import { spawnAgent } from './agent';
import { retryWithBackoff, isNetworkError } from './errors';
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
        const result = await retryWithBackoff(async () => {
          const spawnResult = await spawnAgent({
            agent: this.config.agent,
            prompt,
            workingDir: this.config.workingDir || process.cwd(),
            model
          });
          
          // Only retry network errors, throw immediately for other failures
          if (spawnResult.exitCode !== 0) {
            const error = new Error(`Agent exited with code ${spawnResult.exitCode}: ${spawnResult.stderr}`);
            // Check if stderr indicates network error before retrying
            if (!isNetworkError({ message: spawnResult.stderr })) {
              throw error; // Non-network error, don't retry
            }
            throw error; // Network error, allow retry
          }
          
          return spawnResult;
        });
        
        // Parse response into Anthropic-compatible format
        return parseAgentResponse(result.stdout);
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
