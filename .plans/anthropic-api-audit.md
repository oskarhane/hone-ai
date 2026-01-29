# Anthropic API Usage Audit

**Date:** 2026-01-29  
**Feature:** replace-direct-anthropic-communication-with-agent-

## Executive Summary

Found **2 primary files** with direct Anthropic API usage, totaling **3 instantiations** and **3 distinct API call patterns**.

## Direct Anthropic API Calls

### 1. prd-generator.ts

**Location:** `/Users/oskarhane/Development/hone-ai/src/prd-generator.ts`

**Import Statement:**
```typescript
import Anthropic from '@anthropic-ai/sdk';
```

**API Client Instantiations:**
- Line 90: `const client = new Anthropic({ apiKey });` (in `generateClarifyingQuestion`)
- Line 149: `const client = new Anthropic({ apiKey });` (in `generatePRDContent`)

**API Calls:**

#### Call Pattern A: Clarifying Questions
- **Function:** `generateClarifyingQuestion()` (lines 76-134)
- **API Method:** `client.messages.create()`
- **Model Source:** `config.models?.claude || 'claude-sonnet-4'` (line 88)
- **Max Tokens:** 500
- **Streaming:** No
- **Error Handling:** `retryWithBackoff()` wrapper (lines 110-124)
- **Purpose:** Generate clarifying questions for PRD refinement
- **Usage Phase:** PRD generation (non-phase-specific)

#### Call Pattern B: PRD Content Generation
- **Function:** `generatePRDContent()` (lines 136-221)
- **API Method:** `client.messages.create()`
- **Model Source:** `config.models?.claude || 'claude-sonnet-4-20250514'` (line 147)
- **Max Tokens:** 4000
- **Streaming:** No
- **Error Handling:** `retryWithBackoff()` wrapper (lines 197-211)
- **Purpose:** Generate final PRD content
- **Usage Phase:** PRD generation (non-phase-specific)

### 2. task-generator.ts

**Location:** `/Users/oskarhane/Development/hone-ai/src/task-generator.ts`

**Import Statement:**
```typescript
import Anthropic from '@anthropic-ai/sdk';
```

**API Client Instantiations:**
- Line 82: `const client = new Anthropic({ apiKey });`

**API Calls:**

#### Call Pattern C: Task Generation from PRD
- **Function:** `generateTasksWithAI()` (lines 73-190)
- **API Method:** `client.messages.create()`
- **Model Source:** `config.models?.claude || 'claude-sonnet-4-20250514'` (line 80)
- **Max Tokens:** 8000
- **Streaming:** No
- **Error Handling:** `retryWithBackoff()` wrapper (lines 143-157)
- **Purpose:** Generate tasks from PRD content
- **Usage Phase:** Task generation (non-phase-specific)
- **Response Format:** JSON array (may be wrapped in markdown code blocks)

## Model Selection Patterns

### Current Configuration
- **Config File:** `.plans/hone.config.yml`
- **Config Structure:** (from config.ts, lines 8-16)
  ```typescript
  models: {
    opencode: string;
    claude: string;
  }
  ```
- **Default Models:** `claude-sonnet-4-20250514` (lines 21-22)

### Model Selection Logic
1. All calls use: `config.models?.claude || '<fallback-model>'`
2. Fallback models vary:
   - prd-generator clarifying: `'claude-sonnet-4'` (no date suffix)
   - prd-generator content: `'claude-sonnet-4-20250514'` (with date suffix)
   - task-generator: `'claude-sonnet-4-20250514'` (with date suffix)
3. **Inconsistency detected:** prd-generator clarifying question uses short model name

## Streaming Response Patterns

**Finding:** NONE of the current Anthropic API calls use streaming.

All calls use:
```typescript
await client.messages.create({
  model,
  max_tokens: <n>,
  messages: [...]
})
```

No `stream: true` parameter detected.

## Error Handling Patterns

### Pattern: Retry with Backoff
All API calls wrapped with `retryWithBackoff()` from `errors.ts`:

```typescript
await retryWithBackoff(
  () => client.messages.create({ ... })
).catch(error => {
  const { message, details } = ErrorMessages.NETWORK_ERROR_FINAL(error);
  exitWithError(message, details);
  throw error;
});
```

### Error Handling Features
- Exponential backoff (initial 1s, max 10s delay)
- Default 3 retry attempts
- Network error detection (ECONNREFUSED, ETIMEDOUT, etc.)
- Structured error messages with details
- Test mode support (throws instead of exiting)

## API Key Management

**Pattern:** Consistent across all files
- Retrieved via: `getApiKey()` from config.ts (line 75)
- Source: `process.env.ANTHROPIC_API_KEY`
- Validation: Manual check with error if missing
- Not stored in config file

## Phase-Specific vs Non-Phase Usage

### Current Phase-Specific Operations
From AGENTS.md (lines 68-82) and run.ts (lines 20-207):
- **Implement Phase:** Uses agent subprocess spawning (not direct API)
- **Review Phase:** Uses agent subprocess spawning (not direct API)
- **Finalize Phase:** Uses agent subprocess spawning (not direct API)

### Non-Phase Operations (Current Direct API Usage)
1. **PRD Generation:**
   - Clarifying questions (interactive)
   - Final PRD content generation
   
2. **Task Generation:**
   - Converting PRD to task list

**Key Finding:** Phase-specific operations (implement/review/finalize) already use agent subprocess spawning via `spawnAgent()` in agent.ts. Only PRD and task generation use direct Anthropic API.

## Dependencies

### Current Dependencies (package.json)
```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.71.2",
  "ai": "^6.0.57",
  "commander": "^14.0.2",
  "js-yaml": "^4.1.1"
}
```

### Dependency Analysis
- `@anthropic-ai/sdk`: Used only in prd-generator.ts and task-generator.ts
- `ai`: Usage unknown (needs investigation)
- Removal candidate: `@anthropic-ai/sdk` (after replacement complete)

## Agent Service Architecture

### Existing Agent Infrastructure
**File:** `src/agent.ts`

**Available Functions:**
1. `spawnAgent(options)` - Spawns agent subprocess (opencode/claude)
2. `isAgentAvailable(agent)` - Checks if agent binary exists in PATH

**Agent Types:**
- `opencode`: Command `opencode run "prompt"`
- `claude`: Command `claude -p "prompt"`

**Communication Pattern:**
- Non-interactive mode with prompt argument
- stdio: ['inherit', 'pipe', 'pipe']
- Streams stdout/stderr in real-time
- Returns: `{ exitCode, stdout, stderr }`

**Key Limitation:** Current agent.ts only supports subprocess spawning, not direct API-like calls.

## Response Parsing Patterns

### JSON Extraction (task-generator.ts, lines 164-169)
```typescript
let jsonText = content.text.trim();
const jsonMatch = jsonText.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
if (jsonMatch && jsonMatch[1]) {
  jsonText = jsonMatch[1];
}
```
Handles AI responses wrapped in markdown code blocks.

### Text Extraction (prd-generator.ts, line 127)
```typescript
const content = response.content[0];
const text = content && content.type === 'text' ? content.text.trim() : '';
```
Extracts text from first content block.

## Summary of Findings

### Total Anthropic API Usage
- **Files:** 2 (prd-generator.ts, task-generator.ts)
- **Client Instantiations:** 3
- **API Call Sites:** 3
- **Streaming Calls:** 0
- **Non-Streaming Calls:** 3

### Current Model Selection
- **Configuration:** models.claude in hone.config.yml
- **Default:** claude-sonnet-4-20250514
- **Phase-Specific:** None (all use same model config)
- **Inconsistency:** 1 call uses short name without date suffix

### Error Handling
- **Pattern:** retryWithBackoff() wrapper
- **Retries:** 3 attempts with exponential backoff
- **Network Error Detection:** Yes
- **Structured Errors:** Yes

### Agent Integration
- **Phase Operations:** Already use agent subprocess spawning
- **Non-Phase Operations:** Use direct Anthropic API (targets for replacement)
- **Agent Communication:** Subprocess-based, not API-based

## Recommendations for Implementation

1. **Model Inconsistency:** Fix prd-generator.ts line 88 to use full version format
2. **Agent API Design:** Need to create API-style agent communication (not just subprocess)
3. **Streaming Support:** Not required for current usage patterns
4. **Configuration Schema:** Add phase-specific model config (prd, prd-to-tasks, implement, review, finalize)
5. **Response Handling:** Preserve existing JSON extraction and text parsing logic
6. **Error Handling:** Maintain retryWithBackoff pattern for agent calls
