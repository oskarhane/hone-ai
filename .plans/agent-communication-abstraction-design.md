# Agent Communication Abstraction Layer Design

**Date:** 2026-01-29  
**Feature:** replace-direct-anthropic-communication-with-agent-  
**Task:** task-003 - Design agent communication abstraction layer

## Overview

Design an abstraction layer that replaces direct Anthropic SDK API calls with agent subprocess calls while maintaining backward compatibility and current behavior.

## Current Architecture

### Direct Anthropic API Pattern
```typescript
// Current: Direct SDK usage
const client = new Anthropic({ apiKey });
const response = await retryWithBackoff(
  () => client.messages.create({
    model: config.models?.claude || 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  })
);
const content = response.content[0];
const text = content.type === 'text' ? content.text.trim() : '';
```

**Usage Locations:**
- `prd-generator.ts`: 2 calls (clarifying questions, PRD content)
- `task-generator.ts`: 1 call (task generation from PRD)

### Existing Agent Subprocess Pattern
```typescript
// Phase operations: Already using agent subprocesses
const result = await spawnAgent({
  agent,
  prompt,
  workingDir: process.cwd()
});
// Returns: { exitCode, stdout, stderr }
```

## Abstraction Layer Design

### Core Interface: `AgentClient`

Create a new interface that mirrors Anthropic SDK's message creation but routes through agent subprocess:

```typescript
// New file: src/agent-client.ts

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

export class AgentClient {
  private config: AgentClientConfig;
  
  constructor(config: AgentClientConfig) {
    this.config = config;
  }
  
  async messages.create(request: AgentMessageRequest): Promise<AgentMessageResponse> {
    // Transform request → agent subprocess call
    // Return response in Anthropic-compatible format
  }
}
```

### Transformation Logic

#### 1. Model Selection & Transformation

**Input:** Model string from config or request  
**Output:** Agent-specific model argument

```typescript
function transformModelForAgent(model: string, agent: AgentType): string[] {
  // OpenCode: Requires 'anthropic/' prefix
  // Format: anthropic/claude-sonnet-4-20250514
  if (agent === 'opencode') {
    return ['--model', `anthropic/${model}`];
  }
  
  // Claude: Use model as-is (supports full names)
  // Format: claude-sonnet-4-20250514 or aliases like 'sonnet'
  if (agent === 'claude') {
    return ['--model', model];
  }
  
  return [];
}
```

#### 2. Prompt Construction

**Input:** `AgentMessageRequest` (messages, system prompt)  
**Output:** Single prompt string for agent

```typescript
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
      // Handle assistant messages if needed (for multi-turn)
      parts.push(`Previous response: ${message.content}`);
    }
  }
  
  return parts.join('\n');
}
```

#### 3. Response Parsing

**Input:** Agent stdout (plain text)  
**Output:** `AgentMessageResponse` (Anthropic-compatible format)

```typescript
function parseAgentResponse(stdout: string): AgentMessageResponse {
  return {
    content: [{
      type: 'text',
      text: stdout.trim()
    }]
  };
}
```

#### 4. Error Handling & Retry

**Strategy:** Maintain existing `retryWithBackoff` pattern for transient failures

```typescript
async function executeWithRetry(
  agent: AgentType,
  prompt: string,
  model: string,
  workingDir: string
): Promise<SpawnAgentResult> {
  return retryWithBackoff(async () => {
    const modelArgs = transformModelForAgent(model, agent);
    const result = await spawnAgentWithModel({
      agent,
      prompt,
      workingDir,
      modelArgs
    });
    
    if (result.exitCode !== 0) {
      // Treat non-zero exit as retryable error
      throw new Error(`Agent exited with code ${result.exitCode}: ${result.stderr}`);
    }
    
    return result;
  });
}
```

**Error Mapping:**
- Agent spawn failure → Network error (retryable)
- Exit code != 0 → Network error (retryable)
- Max retries exceeded → `NETWORK_ERROR_FINAL`

### Extended Agent Spawning

Update `spawnAgent()` to support model selection:

```typescript
// Update: src/agent.ts

export interface SpawnAgentOptions {
  agent: AgentType;
  prompt: string;
  workingDir?: string;
  model?: string;  // NEW
}

export async function spawnAgent(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  const { agent, prompt, workingDir = process.cwd(), model } = options;
  
  // Build command and args based on agent type
  const command = agent === 'opencode' ? 'opencode' : 'claude';
  const args: string[] = [];
  
  if (agent === 'opencode') {
    args.push('run');
    // Add model if specified
    if (model) {
      args.push('--model', `anthropic/${model}`);
    }
    args.push(prompt);
  } else {
    args.push('-p');
    args.push(prompt);
    // Add model if specified
    if (model) {
      args.push('--model', model);
    }
  }
  
  // Rest of existing spawn logic...
}
```

## API Surface Comparison

### Before (Direct Anthropic SDK)
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey });
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4000,
  messages: [{ role: 'user', content: 'Generate PRD' }],
  system: 'You are a technical PM'
});

const text = response.content[0].text;
```

### After (Agent Client Abstraction)
```typescript
import { AgentClient } from './agent-client';

const client = new AgentClient({
  agent: 'opencode',
  model: 'claude-sonnet-4-20250514'
});

const response = await client.messages.create({
  max_tokens: 4000,
  messages: [{ role: 'user', content: 'Generate PRD' }],
  system: 'You are a technical PM'
});

const text = response.content[0].text;
```

**Key Changes:**
- Import path: `@anthropic-ai/sdk` → `./agent-client`
- Constructor: `new Anthropic({ apiKey })` → `new AgentClient({ agent, model })`
- API calls: Same interface, different implementation
- No API key required (agents handle authentication)

## Migration Strategy

### Phase 1: Create Abstraction Layer
1. Create `src/agent-client.ts` with `AgentClient` class
2. Update `src/agent.ts` to support model parameter
3. Add model transformation utilities
4. Add response parsing utilities
5. Integrate `retryWithBackoff` for error handling

### Phase 2: Replace PRD Generator
1. Replace `new Anthropic({ apiKey })` with `new AgentClient({ agent, model })`
2. Update `generateClarifyingQuestion()` to use `AgentClient`
3. Update `generatePRDContent()` to use `AgentClient`
4. Test PRD generation end-to-end

### Phase 3: Replace Task Generator
1. Update `generateTasksWithAI()` to use `AgentClient`
2. Test task generation end-to-end
3. Verify JSON extraction still works (markdown code blocks)

### Phase 4: Cleanup
1. Remove `import Anthropic from '@anthropic-ai/sdk'` from all files
2. Remove `@anthropic-ai/sdk` from package.json dependencies
3. Remove API key validation from non-agent code paths

## Backward Compatibility

### Response Format
- **Requirement:** Maintain exact response structure
- **Implementation:** Parse stdout into `{ content: [{ type: 'text', text: '...' }] }` format
- **Benefit:** Zero changes to response parsing code

### Error Handling
- **Requirement:** Same retry behavior and error messages
- **Implementation:** Wrap agent calls with `retryWithBackoff()`
- **Benefit:** Network errors handled identically

### Model Selection
- **Requirement:** Same config-based model selection
- **Implementation:** Read from `config.models.claude` or phase-specific model
- **Benefit:** No config file changes needed initially

## Configuration Integration

### Current Config Schema
```typescript
interface HoneConfig {
  defaultAgent: 'opencode' | 'claude';
  models: {
    opencode: string;
    claude: string;
  };
}
```

### Phase-Specific Models (Future Enhancement)
```typescript
interface HoneConfig {
  defaultAgent: 'opencode' | 'claude';
  models: {
    opencode: string;
    claude: string;
    // Phase-specific models (optional)
    prd?: string;
    prdToTasks?: string;
    implement?: string;
    review?: string;
    finalize?: string;
  };
}
```

### Model Resolution Logic
```typescript
function resolveModel(config: HoneConfig, phase?: string): string {
  // 1. Check phase-specific model
  if (phase && config.models[phase]) {
    return config.models[phase];
  }
  
  // 2. Fall back to agent-specific model
  const agent = config.defaultAgent;
  if (config.models[agent]) {
    return config.models[agent];
  }
  
  // 3. Fall back to default
  return 'claude-sonnet-4-20250514';
}
```

## Error Scenarios

### Agent Not Available
- **Detection:** `isAgentAvailable()` returns false
- **Handling:** Exit with `AGENT_NOT_FOUND` error message
- **User Action:** Install agent binary in PATH

### Model Not Supported
- **Detection:** Agent exits with error about unknown model
- **Handling:** Parse stderr, surface error to user
- **User Action:** Update config with valid model name

### Rate Limiting
- **Detection:** Agent exits with rate limit error in stderr
- **Handling:** `retryWithBackoff` will retry with exponential backoff
- **User Action:** Wait for retry or check API quota

### Network Errors
- **Detection:** Spawn fails or agent exits with network error
- **Handling:** `retryWithBackoff` (3 attempts, 1s-10s backoff)
- **User Action:** Check network connection

## Performance Considerations

### Subprocess Overhead
- **Baseline:** Direct API call (network latency only)
- **With Agent:** Subprocess spawn (~10-50ms) + network latency
- **Mitigation:** Negligible for long-running LLM requests (seconds)
- **Benefit:** Agents may cache credentials/connections

### Streaming Support (Future)
- **Current:** No streaming used in codebase
- **OpenCode:** `--format json` for streaming events
- **Claude:** `--output-format stream-json` for streaming
- **Implementation:** Can add incrementally when needed

## Testing Strategy

### Unit Tests
- `AgentClient.messages.create()` → Verify correct subprocess args
- `transformModelForAgent()` → Verify opencode prefix, claude passthrough
- `constructPromptFromRequest()` → Verify prompt formatting
- `parseAgentResponse()` → Verify response structure

### Integration Tests
- PRD generation with agent client (full flow)
- Task generation with agent client (full flow)
- Error handling (agent not found, non-zero exit)
- Retry logic (network errors)

### Acceptance Criteria
- All existing PRD generation tests pass
- All existing task generation tests pass
- No changes to output format or user experience
- Error messages remain clear and actionable

## Open Questions

None - all requirements clarified in task-001 and task-002.

## Acceptance Criteria Checklist

- [x] Abstraction layer interface designed and documented
- [x] Mapping between Anthropic calls and agent calls defined
- [x] Streaming response handling strategy documented (not needed initially)
- [x] Error handling and retry logic design completed
- [x] Model selection parameter passing strategy defined

## Implementation Notes

### Key Design Decisions
1. **Mirror Anthropic SDK API:** Minimize code changes during migration
2. **Extend spawnAgent():** Reuse existing subprocess infrastructure
3. **Transform model names:** Agent-specific format (opencode needs prefix)
4. **Parse stdout as text:** Simplest response format (no streaming needed)
5. **Maintain retry logic:** Same user experience for network errors

### Non-Goals
- Streaming support (not used in current codebase)
- Multi-turn conversations (only single-shot requests)
- Custom agent flags (max-tokens not passed to agents)
- Agent-specific optimizations (use defaults)

### Future Enhancements
- Phase-specific model configuration (task-004)
- Streaming response support (if needed)
- Request batching (if performance issues)
- Agent response caching (for repeated requests)
