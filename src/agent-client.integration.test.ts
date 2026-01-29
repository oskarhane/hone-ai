import { describe, test, expect } from 'bun:test';
import { AgentClient, type AgentMessageRequest } from './agent-client';

describe('AgentClient Integration', () => {
  // Note: These tests verify the API surface is correct.
  // Actual agent subprocess spawning is tested manually or in CI
  // where real agent binaries (opencode/claude) are available.
  
  describe('API compatibility', () => {
    test('mirrors Anthropic SDK interface', () => {
      const client = new AgentClient({
        agent: 'opencode',
        model: 'claude-sonnet-4-20250514'
      });
      
      // Verify the API surface matches Anthropic SDK
      expect(client.messages).toBeDefined();
      expect(typeof client.messages.create).toBe('function');
      
      // Verify request structure matches Anthropic SDK
      const validRequest: AgentMessageRequest = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          { role: 'user', content: 'Test message' }
        ],
        system: 'You are a helpful assistant'
      };
      
      // This shouldn't throw TypeScript errors
      expect(validRequest.messages).toHaveLength(1);
    });
    
    test('supports minimal request format', () => {
      const client = new AgentClient({
        agent: 'claude',
        model: 'claude-sonnet-4-20250514'
      });
      
      // Minimal valid request
      const minimalRequest: AgentMessageRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };
      
      expect(minimalRequest.messages).toHaveLength(1);
    });
    
    test('supports multi-turn conversations', () => {
      const client = new AgentClient({
        agent: 'opencode',
        model: 'claude-sonnet-4-20250514'
      });
      
      const multiTurnRequest: AgentMessageRequest = {
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '4' },
          { role: 'user', content: 'What about 3+3?' }
        ]
      };
      
      expect(multiTurnRequest.messages).toHaveLength(3);
    });
  });
  
  describe('configuration', () => {
    test('accepts opencode agent configuration', () => {
      const client = new AgentClient({
        agent: 'opencode',
        model: 'claude-opus-4-20250514',
        workingDir: '/custom/path'
      });
      
      expect(client).toBeDefined();
      expect(client.messages.create).toBeDefined();
    });
    
    test('accepts claude agent configuration', () => {
      const client = new AgentClient({
        agent: 'claude',
        model: 'claude-sonnet-4-20250514'
      });
      
      expect(client).toBeDefined();
      expect(client.messages.create).toBeDefined();
    });
    
    test('accepts optional model in config', () => {
      // Model can be omitted if it will be provided per-request
      const client = new AgentClient({
        agent: 'opencode'
      });
      
      expect(client).toBeDefined();
    });
  });
});
