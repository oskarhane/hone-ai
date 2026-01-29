# Agent Service Analysis

**Date:** 2026-01-29  
**Feature:** replace-direct-anthropic-communication-with-agent-  
**Task:** task-002 - Analyze agent service interfaces and capabilities

## Executive Summary

Both `opencode` and `claude` agents support model selection, streaming responses, and non-interactive operation. Key finding: current usage in hone only uses subprocess spawning for phase operations, not for PRD/task generation which still use direct Anthropic API.

## Agent Types

### 1. OpenCode

**Binary Location:** `/Users/oskarhane/.bun/bin/opencode`

**Non-Interactive Mode:**
```bash
opencode run [message..]
```

**Model Selection:**
- Flag: `--model` or `-m`
- Format: `provider/model` (e.g., `anthropic/claude-sonnet-4-20250514`)
- Example: `opencode run -m anthropic/claude-sonnet-4-20250514 "Generate PRD"`

**Key Options:**
- `--model, -m`: Model to use in format provider/model
- `--agent`: Agent to use
- `--continue, -c`: Continue last session
- `--session, -s`: Session id to continue
- `--format`: Output format - "default" (formatted) or "json" (raw JSON events)
- `--variant`: Model variant (provider-specific reasoning effort: high, max, minimal)

**Output Formats:**
- **default**: Formatted text output (human-readable)
- **json**: Raw JSON events (streaming format)

### 2. Claude

**Binary Location:** `/Users/oskarhane/.nvm/versions/node/v22.19.0/bin/claude`

**Non-Interactive Mode:**
```bash
claude -p "prompt text"
# or
claude --print "prompt text"
```

**Model Selection:**
- Flag: `--model`
- Format: Alias (e.g., 'sonnet', 'opus') or full name (e.g., 'claude-sonnet-4-5-20250929')
- Example: `claude -p "Generate PRD" --model sonnet`

**Key Options:**
- `--model`: Model for current session (aliases or full names)
- `--print, -p`: Print response and exit (non-interactive, useful for pipes)
- `--output-format`: "text" (default), "json" (single result), or "stream-json" (realtime streaming)
- `--input-format`: "text" (default) or "stream-json" (realtime streaming input)
- `--max-budget-usd`: Maximum dollar amount for API calls (with --print)
- `--fallback-model`: Automatic fallback when default model overloaded (with --print)
- `--json-schema`: JSON Schema for structured output validation
- `--continue, -c`: Continue most recent conversation
- `--resume, -r`: Resume by session ID or interactive picker
- `--session-id`: Use specific session ID (UUID)

**Output Formats:**
- **text**: Plain text output (default)
- **json**: Single JSON result
- **stream-json**: Realtime streaming JSON events

## Current Implementation in Hone

### Existing Agent Infrastructure (src/agent.ts)

**Function:** `spawnAgent(options)`
- Spawns agent subprocess using `child_process.spawn`
- Returns: `{ exitCode, stdout, stderr }`
- Usage: Phase operations (implement, review, finalize)

**Current Command Construction:**
```typescript
// opencode: opencode run "prompt text"
const command = 'opencode';
const args = ['run', prompt];

// claude: claude -p "prompt text"  
const command = 'claude';
const args = ['-p', prompt];
```

**Key Limitation:** No model selection parameter passed to agents in current implementation.

## Model Selection Capabilities

### OpenCode Model Format
- **Format:** `provider/model`
- **Examples:**
  - `anthropic/claude-sonnet-4-20250514`
  - `anthropic/claude-opus-4-20250514`
- **Configuration:** Via `--model` or `-m` flag
- **Validation:** Unknown - likely validated by agent at runtime

### Claude Model Format
- **Format:** Alias or full name
- **Aliases:** 'sonnet', 'opus', 'haiku'
- **Full Names:** 'claude-sonnet-4-5-20250929', 'claude-opus-4-20250514'
- **Configuration:** Via `--model` flag
- **Validation:** Unknown - likely validated by agent at runtime

### Mapping Current Config to Agent Models

**Current Hone Config (config.ts):**
```typescript
models: {
  opencode: 'claude-sonnet-4-20250514',
  claude: 'claude-sonnet-4-20250514'
}
```

**Required Transformations:**
- **OpenCode:** Prepend provider - `'claude-sonnet-4-20250514'` → `'anthropic/claude-sonnet-4-20250514'`
- **Claude:** Use as-is or convert to alias - `'claude-sonnet-4-20250514'` → `'sonnet'` or use full name

## Streaming Response Support

### OpenCode Streaming
- **Flag:** `--format json`
- **Output:** Raw JSON events (streaming format)
- **Realtime:** Yes - events streamed as they occur
- **Compatible:** Yes - can be parsed incrementally

### Claude Streaming
- **Flag:** `--output-format stream-json`
- **Output:** Realtime streaming JSON events
- **Input Streaming:** `--input-format stream-json` for realtime input
- **Message Replay:** `--replay-user-messages` to re-emit user messages
- **Compatible:** Yes - supports both input and output streaming

### Current Hone Streaming Usage
**Finding:** NONE of the current Anthropic API calls use streaming.

All calls are non-streaming:
```typescript
await client.messages.create({
  model,
  max_tokens: 4000,
  messages: [...]
})
```

**Implication:** Streaming support not required for initial migration, but available if needed.

## Error Response Formats

### Current Error Handling Pattern (from audit)
All API calls wrapped with `retryWithBackoff()`:
```typescript
await retryWithBackoff(
  () => client.messages.create({ ... })
).catch(error => {
  const { message, details } = ErrorMessages.NETWORK_ERROR_FINAL(error);
  exitWithError(message, details);
});
```

### Agent Subprocess Error Handling (src/agent.ts)
**Spawn Errors:**
```typescript
child.on('error', (error: Error) => {
  reject(new Error(`Failed to spawn ${agent}: ${error.message}`));
});
```

**Exit Code Errors:**
```typescript
child.on('close', (code: number | null) => {
  resolve({
    exitCode: code ?? 1,  // null treated as 1
    stdout,
    stderr
  });
});
```

**Usage in run.ts:**
```typescript
if (implementResult.exitCode !== 0) {
  console.error('\n✗ Implement phase failed');
  console.error(`\nAgent exit code: ${implementResult.exitCode}`);
  if (implementResult.stderr) {
    console.error('\nError output:');
    console.error(implementResult.stderr);
  }
  throw new Error(`Implement phase failed with exit code ${implementResult.exitCode}`);
}
```

### Agent Error Patterns

**OpenCode:**
- Exit codes: 0 (success), non-zero (failure)
- Error output: Sent to stderr
- Error types: Command not found, model errors, API errors, validation errors

**Claude:**
- Exit codes: 0 (success), non-zero (failure)
- Error output: Sent to stderr
- Error types: Command not found, model errors, API errors, permission errors
- Special flags: `--fallback-model` for overload handling

### Error Handling Strategy for Migration

1. **Network Errors:** Maintain `retryWithBackoff()` pattern for transient failures
2. **Model Unavailability:** Surface to user via stderr parsing
3. **Rate Limiting:** Surface to user via stderr parsing
4. **Validation Errors:** Surface to user via stderr parsing
5. **Agent Not Found:** Already handled by `isAgentAvailable()`

## Configuration Parameters

### Current Hone Configuration

**File:** `.plans/hone.config.yml`

**Structure (config.ts):**
```typescript
interface HoneConfig {
  defaultAgent: 'opencode' | 'claude';
  models: {
    opencode: string;
    claude: string;
  };
  commitPrefix: string;
  feedbackInstructions?: string;
  lintCommand?: string;
}
```

**Current Values:**
```yaml
defaultAgent: opencode
models:
  opencode: claude-sonnet-4-20250514
  claude: claude-sonnet-4-20250514
commitPrefix: hone
feedbackInstructions: 'test: bun test'
```

### Required Configuration Extensions

**Phase-Specific Model Configuration (from task-004):**
```typescript
interface HoneConfig {
  // ... existing fields
  models: {
    opencode: string;
    claude: string;
    // NEW: Phase-specific models
    prd?: string;
    prdToTasks?: string;
    implement?: string;
    review?: string;
    finalize?: string;
  };
}
```

**Fallback Logic:**
1. Check phase-specific model (e.g., `models.prd`)
2. Fall back to agent-specific model (e.g., `models.opencode`)
3. Fall back to default (e.g., `claude-sonnet-4-20250514`)

### Additional Configuration Needs

**From PRD Open Questions:**
- Model availability validation: Surface errors to user
- Rate limiting handling: Surface errors to user
- Fallback logic: Use agent fallback features (`--fallback-model` for claude)

## Integration Compatibility

### Chat Service Integration
**Requirement:** Replace direct Anthropic API calls in chat services

**Current Pattern (prd-generator.ts, task-generator.ts):**
```typescript
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

**Proposed Agent Pattern:**
```typescript
const result = await spawnAgent({
  agent,
  prompt,
  workingDir: process.cwd(),
  model: resolveModel(config, phase)  // NEW
});

if (result.exitCode !== 0) {
  // Handle error via stderr
  throw new Error(result.stderr);
}

const text = result.stdout.trim();
```

**Compatibility:** High - similar input/output patterns

### Message Formatting
**Current:** Plain text prompts
**Agent Support:** Plain text prompts via command line
**Compatibility:** High - no transformation needed

### Response Parsing

**Current Patterns:**
1. **Text Extraction:** `content.text.trim()`
2. **JSON Extraction:** Regex to unwrap markdown code blocks

**Agent Support:**
- Text output via stdout
- JSON format via `--format json` (opencode) or `--output-format json` (claude)

**Compatibility:** High - can use stdout directly

## Performance Considerations

### Current Direct API Performance
- Network latency to Anthropic API
- Retry logic: 3 attempts with exponential backoff (1s initial, 10s max)
- Streaming: Not used

### Agent Subprocess Performance
- Process spawn overhead (~10-50ms)
- Agent startup time (variable)
- Network latency to Anthropic API (via agent)
- Streaming: Available if needed

**Expected Impact:** 
- Minimal additional latency from subprocess spawn
- Agent may cache credentials/connections
- Overall performance should remain comparable

## Recommendations

### 1. Model Selection Implementation
- **OpenCode:** Prepend `anthropic/` to model names from config
- **Claude:** Use model names as-is (supports full names)
- **Validation:** Let agents validate models, surface errors to user

### 2. Streaming Support
- **Priority:** Low (not currently used)
- **Implementation:** Use `--format json` (opencode) or `--output-format stream-json` (claude)
- **Future:** Can add streaming support incrementally

### 3. Error Handling
- **Strategy:** Parse stderr for error messages
- **Retry:** Maintain retryWithBackoff for spawn errors
- **User Feedback:** Surface agent errors directly to user

### 4. Configuration Schema
- **Add:** Phase-specific model config (`prd`, `prdToTasks`, `implement`, `review`, `finalize`)
- **Fallback:** Phase → Agent → Default
- **Validation:** Runtime validation by agents

### 5. Integration Approach
- **Phase 1:** Replace prd-generator.ts (2 calls)
- **Phase 2:** Replace task-generator.ts (1 call)
- **Phase 3:** Clean up Anthropic SDK dependency

## API Surface Summary

### OpenCode
- **Command:** `opencode run "prompt"`
- **Model Flag:** `--model provider/model`
- **Output:** stdout (default format or json)
- **Errors:** stderr + exit code
- **Streaming:** `--format json`

### Claude
- **Command:** `claude -p "prompt"`
- **Model Flag:** `--model name-or-alias`
- **Output:** stdout (text, json, or stream-json)
- **Errors:** stderr + exit code
- **Streaming:** `--output-format stream-json`
- **Fallback:** `--fallback-model name`

## Acceptance Criteria Verification

- [x] Agent service API documentation reviewed and summarized
- [x] Model selection capabilities in agents documented
- [x] Streaming response support in agents confirmed
- [x] Error response formats from agents documented
- [x] Configuration parameters for agents identified

## Next Steps

Task-003 (design abstraction layer) should:
1. Design interface to map Anthropic calls → agent subprocess calls
2. Design model name transformation logic (config → agent format)
3. Design error mapping (stderr → HoneError)
4. Design response parsing (stdout → text/JSON)
5. Design retry logic integration with agent spawning
