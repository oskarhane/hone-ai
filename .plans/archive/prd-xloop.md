# PRD: xloop — AI Coding Agent Orchestrator

## Overview

xloop is a CLI tool built with Bun.js that orchestrates AI coding agents (opencode or claude code) to implement features based on user-authored PRDs. It manages the full lifecycle from requirements gathering through implementation, review, and commit — enabling iterative, autonomous development with human oversight.

The tool maintains its state in a `.plans/` directory within the project, tracking PRDs, task lists, and progress files.

---

## Goals

- Provide a structured workflow for AI-assisted feature development
- Enable iterative implementation with built-in review cycles
- Maintain clear audit trails of what was done and why
- Accumulate project knowledge in AGENTS.md for future agent runs
- Integrate seamlessly with existing git workflows

## Non-Goals

- Real-time collaboration between multiple users
- GUI or web interface
- Support for non-Anthropic models (v1)
- Automatic branch management
- Concurrent execution protection

---

## User Personas

**Primary: Solo Developer / Small Team Lead**
- Wants to delegate implementation of well-defined features to AI
- Values oversight and the ability to review AI work
- Prefers CLI-based workflows integrated with existing tooling

---

## Requirements

### 1. CLI Framework & Configuration

#### 1.1 CLI Setup
- **REQ-1.1.1**: CLI command shall be named `xloop`
- **REQ-1.1.2**: Built with Bun.js runtime
- **REQ-1.1.3**: Use AI-SDK for all AI-related operations
- **REQ-1.1.4**: Anthropic API key loaded from `.env` file (`ANTHROPIC_API_KEY`)

#### 1.2 Configuration File
- **REQ-1.2.1**: Configuration stored in `.plans/xloop.config.json`
- **REQ-1.2.2**: Configurable settings:
  - `defaultAgent`: `"claude"` | `"opencode"` (default: `"claude"`)
  - `models`: Object mapping operation types to model identifiers
    - `prd`: Model for PRD generation (default: `"claude-sonnet-4-20250514"`)
    - `tasks`: Model for task generation (default: `"claude-sonnet-4-20250514"`)
  - `commitPrefix`: Boolean to enable/disable PRD-prefixed commits (default: `true`)
- **REQ-1.2.3**: Config file auto-created with defaults on first run if not present

#### 1.3 Global Flags
- **REQ-1.3.1**: `--agent <opencode|claude>` — Override default agent for this invocation
- **REQ-1.3.2**: `--help` — Display usage information
- **REQ-1.3.3**: `--version` — Display version number

---

### 2. Directory Structure & State Management

#### 2.1 Plans Directory
- **REQ-2.1.1**: All xloop state stored in `.plans/` directory at project root
- **REQ-2.1.2**: Directory auto-created if not present
- **REQ-2.1.3**: Should be committed to version control (not gitignored)

#### 2.2 File Naming Conventions
| File Type | Pattern | Example |
|-----------|---------|---------|
| PRD | `prd-<feature-name>.md` | `prd-delete-button.md` |
| Task List | `tasks-<feature-name>.yml` | `tasks-delete-button.yml` |
| Progress Log | `progress-<feature-name>.txt` | `progress-delete-button.txt` |
| Config | `xloop.config.json` | `xloop.config.json` |

- **REQ-2.2.1**: Feature names derived from PRD content, slugified (lowercase, hyphens, no special chars)
- **REQ-2.2.2**: Feature name limited to 50 characters

---

### 3. Command: `--prds` (List PRDs)

#### 3.1 Functionality
- **REQ-3.1.1**: List all PRD files in `.plans/` directory
- **REQ-3.1.2**: For each PRD, display:
  - PRD filename
  - Associated task file (if exists)
  - Implementation status: `not started` | `in progress` | `completed`
- **REQ-3.1.3**: Status derived from task file:
  - `not started`: No task file exists OR all tasks have status `pending`
  - `in progress`: At least one task `completed`, at least one task not `completed`
  - `completed`: All tasks have status `completed`

#### 3.2 Output Format
```
PRDs in .plans/

  prd-delete-button.md
    Tasks: tasks-delete-button.yml
    Status: in progress (3/7 completed)

  prd-user-auth.md
    Tasks: tasks-user-auth.yml
    Status: completed

  prd-dark-mode.md
    Tasks: none
    Status: not started
```

---

### 4. Command: `--status` (Task Status)

#### 4.1 Functionality
- **REQ-4.1.1**: List all task files with uncompleted tasks
- **REQ-4.1.2**: Exclude fully completed task files from output
- **REQ-4.1.3**: For each task file, display:
  - Filename
  - Count of completed vs total tasks
  - Next task to be worked on (based on dependencies)

#### 4.2 Output Format
```
Active Task Lists:

  tasks-delete-button.yml
    Progress: 3/7 tasks completed
    Next: task-004 "Add confirmation dialog"

  tasks-api-refactor.yml
    Progress: 0/12 tasks completed
    Next: task-001 "Extract API client interface"

No incomplete task lists? Run xloop --prd "your feature" to start!
```

---

### 5. Command: `--prd <text>` (Generate PRD)

#### 5.1 Functionality
- **REQ-5.1.1**: Accept feature description as text argument
- **REQ-5.1.2**: Analyze current codebase to understand:
  - Project structure and architecture
  - Existing patterns and conventions
  - Related existing functionality
  - Tech stack and dependencies
- **REQ-5.1.3**: Generate PRD interactively with clarifying questions
- **REQ-5.1.4**: Maximum 5 rounds of clarifying questions
- **REQ-5.1.5**: User can respond or type `done` to proceed with current information
- **REQ-5.1.6**: Save final PRD to `.plans/prd-<feature-name>.md`

#### 5.2 PRD Document Structure
Generated PRDs shall contain these sections:

```markdown
# PRD: <Feature Name>

## Overview
Brief description of the feature and its purpose.

## Goals
What this feature aims to achieve.

## Non-Goals
What is explicitly out of scope.

## Requirements

### Functional Requirements
- REQ-F-001: ...
- REQ-F-002: ...

### Non-Functional Requirements
- REQ-NF-001: ...

## Technical Considerations
Architecture decisions, integration points, potential challenges.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
Items explicitly not included in this feature.

## Open Questions
Any unresolved questions (populated during interactive session).
```

#### 5.3 Interactive Flow
```
$ xloop --prd "I want to add a delete button to the user profile"

Analyzing codebase...
Found: React app with TypeScript, existing Button component library

I have a few questions to refine this PRD:

1. Should the delete button delete the entire user account, or specific user data?
> The entire account

2. What confirmation flow do you want? (e.g., modal, inline confirm, type-to-confirm)
> Modal with "type DELETE to confirm"

3. Should this trigger a soft delete or hard delete?
> Soft delete, keep data for 30 days

Got it. Any other details? (type 'done' to generate PRD)
> done

Generating PRD...
✓ Saved to .plans/prd-delete-user-account.md
```

---

### 6. Command: `--prd-to-tasks <prd-file>` (Generate Task List)

#### 6.1 Functionality
- **REQ-6.1.1**: Accept path to PRD file as argument
- **REQ-6.1.2**: Parse PRD and generate ordered task list
- **REQ-6.1.3**: Tasks ordered by dependency (prerequisite tasks first)
- **REQ-6.1.4**: Save to `.plans/tasks-<feature-name>.yml`

#### 6.2 Task Schema
```yaml
feature: delete-user-account
prd: prd-delete-user-account.md
created_at: 2025-01-28T10:30:00Z
updated_at: 2025-01-28T10:30:00Z

tasks:
  - id: task-001
    title: "Create DeleteAccountModal component"
    description: |
      Create a new modal component that displays a confirmation dialog
      for account deletion. Should include a text input that requires
      the user to type "DELETE" to enable the confirm button.
    status: pending  # pending | in_progress | completed | failed
    dependencies: []
    acceptance_criteria:
      - Modal renders with warning message
      - Text input validates against "DELETE" string
      - Confirm button disabled until validation passes
      - Cancel button closes modal without action
    completed_at: null
    
  - id: task-002
    title: "Add delete account API endpoint"
    description: |
      Create POST /api/user/delete endpoint that initiates soft delete.
      Should set deleted_at timestamp and schedule hard delete for 30 days.
    status: pending
    dependencies: []
    acceptance_criteria:
      - Endpoint requires authentication
      - Sets deleted_at timestamp on user record
      - Returns 200 with confirmation message
      - Schedules cleanup job for 30 days
    completed_at: null

  - id: task-003
    title: "Integrate DeleteAccountModal into ProfileSettings"
    description: |
      Add "Delete Account" button to profile settings page that opens
      the DeleteAccountModal. Wire up the confirmation to call the API.
    status: pending
    dependencies:
      - task-001
      - task-002
    acceptance_criteria:
      - Delete Account button visible in profile settings
      - Clicking button opens DeleteAccountModal
      - Confirming deletion calls API and logs user out
      - Error states handled gracefully
    completed_at: null
```

#### 6.3 Output
```
$ xloop --prd-to-tasks .plans/prd-delete-user-account.md

Analyzing PRD...
Generating tasks...

✓ Created 7 tasks with dependencies
✓ Saved to .plans/tasks-delete-user-account.yml

Task Overview:
  1. task-001: Create DeleteAccountModal component
  2. task-002: Add delete account API endpoint
  3. task-003: Integrate DeleteAccountModal into ProfileSettings
  4. task-004: Add soft delete migration
  5. task-005: Create cleanup scheduled job
  6. task-006: Add unit tests for delete flow
  7. task-007: Add E2E test for account deletion
```

---

### 7. Command: `--do <tasks-file>` (Execute Tasks)

#### 7.1 Flags
- **REQ-7.1.1**: `--iterations <n>` or `-i <n>` — Number of tasks to attempt (required)
- **REQ-7.1.2**: `--skip=review` — Skip the review phase for faster iteration (optional)

#### 7.2 Architecture Overview
xloop acts as a thin orchestration layer. For each iteration, it invokes the underlying agent (opencode/claude) up to 3 times with different prompts. The agent handles all file operations, task updates, and git commits.

#### 7.3 Iteration Workflow — Three Agent Invocations

```
┌─────────────────────────────────────────────────────────────┐
│ INVOCATION 1: IMPLEMENT                                     │
│                                                             │
│ xloop sends to agent:                                       │
│   • /AGENTS.md (project knowledge)                          │
│   • .plans/tasks-<feature>.yml (full task list)             │
│   • .plans/progress-<feature>.txt (what's been done)        │
│   • Prompt: "Pick the most important uncompleted task,      │
│     respecting dependencies, and implement it."             │
│                                                             │
│ Agent:                                                      │
│   → Selects task based on priority and dependencies         │
│   → Implements the task (creates/modifies files)            │
│   → Outputs which task it worked on                         │
├─────────────────────────────────────────────────────────────┤
│ INVOCATION 2: REVIEW (skipped if --skip=review)             │
│                                                             │
│ xloop sends to agent:                                       │
│   • /AGENTS.md                                              │
│   • .plans/tasks-<feature>.yml                              │
│   • .plans/progress-<feature>.txt                           │
│   • The task that was just implemented (from invocation 1)  │
│   • Prompt: "Review the changes just made for this task.    │
│     Check for: correctness, tests, security, performance.   │
│     Provide specific feedback."                             │
│                                                             │
│ Agent:                                                      │
│   → Reviews current git diff / changes                      │
│   → Outputs review feedback                                 │
├─────────────────────────────────────────────────────────────┤
│ INVOCATION 3: FINALIZE                                      │
│                                                             │
│ xloop sends to agent:                                       │
│   • /AGENTS.md                                              │
│   • .plans/tasks-<feature>.yml                              │
│   • .plans/progress-<feature>.txt                           │
│   • The task that was implemented                           │
│   • Review feedback (from invocation 2, if not skipped)     │
│   • Prompt: "Apply any changes based on review feedback.    │
│     Then:                                                   │
│     1. Update tasks-<feature>.yml - mark task completed     │
│     2. Update progress-<feature>.txt - add iteration summary│
│     3. Update /AGENTS.md if you learned anything useful     │
│     4. Commit all changes with message format:              │
│        <feature>-<task-id>: <descriptive message>"          │
│                                                             │
│ Agent:                                                      │
│   → Applies refactoring based on review (if any)            │
│   → Updates tasks YAML (status: completed)                  │
│   → Appends to progress file                                │
│   → Optionally updates AGENTS.md                            │
│   → Commits with proper message format                      │
└─────────────────────────────────────────────────────────────┘
```

#### 7.4 xloop Responsibilities (Minimal)
xloop itself only needs to:
1. Parse CLI arguments
2. Read the context files (AGENTS.md, tasks file, progress file)
3. Construct and send prompts to the agent
4. Capture agent output to determine which task was worked on
5. Pass context between invocations
6. Repeat for n iterations

The agent handles: task selection, implementation, file updates, and git commits.

#### 7.5 Task File Manual Editing
- **REQ-7.5.1**: Users may manually edit task files to add, remove, or reorder tasks
- **REQ-7.5.2**: Agent must handle task files that have been modified externally
- **REQ-7.5.3**: Manual edits should preserve YAML schema compliance

#### 7.6 Failure Handling
- **REQ-7.6.1**: If a task fails (agent cannot complete, tests fail, etc.), immediately exit
- **REQ-7.6.2**: Do not mark failed task as completed
- **REQ-7.6.3**: Display error message with details
- **REQ-7.6.4**: On next `--do` invocation, same task will be selected (no resume logic needed)

#### 7.7 Progress File Format
`.plans/progress-<feature-name>.txt` (updated by agent in Invocation 3):
```
================================================================================
ITERATION 1 - task-001: Create DeleteAccountModal component
Date: 2025-01-28T10:45:00Z
================================================================================

Summary:
Created DeleteAccountModal component in src/components/modals/DeleteAccountModal.tsx.
Component includes text input validation requiring user to type "DELETE" to enable
the confirm button. Used existing Modal base component from design system.

Files Changed:
- src/components/modals/DeleteAccountModal.tsx (created)
- src/components/modals/index.ts (modified - added export)

Review Notes:
- Initial implementation missing aria-labels, added in refactor pass
- Added unit test for validation logic

Commit: abc123f

================================================================================
ITERATION 2 - task-002: Add delete account API endpoint
Date: 2025-01-28T11:02:00Z
================================================================================
...
```

#### 7.8 AGENTS.md Updates (by agent)
- **REQ-7.8.1**: Located at project root `/AGENTS.md`
- **REQ-7.8.2**: Created by agent if doesn't exist
- **REQ-7.8.3**: Agent decides if anything useful for future agents was learned
- **REQ-7.8.4**: Examples of useful learnings:
  - Project-specific patterns discovered
  - Non-obvious configuration requirements
  - Gotchas or workarounds found
  - Testing patterns that work well
- **REQ-7.8.5**: Append under fitting heading, or create new heading if none fits

Example AGENTS.md entry:
```markdown
## Modal Components

When creating modals in this project, always use the `BaseModal` component from
`src/components/modals/BaseModal.tsx`. It handles focus trapping, escape key
closing, and portal rendering automatically.

## API Endpoints

All API routes must be added to `src/api/routes.ts` registry for OpenAPI doc
generation. Forgetting this step will cause CI to fail.
```

#### 7.9 Output During Execution
```
$ xloop --do .plans/tasks-delete-user-account.yml -i 3

Starting xloop with 3 iterations...
Agent: claude (default)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Iteration 1/3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Invocation 1: Implement]
Sending task context to agent...
[agent output streams here]
→ Agent selected: task-001 "Create DeleteAccountModal component"

[Invocation 2: Review]
Requesting review...
[agent output streams here]
→ Review complete

[Invocation 3: Finalize]
Applying feedback and committing...
[agent output streams here]
→ Task completed and committed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Iteration 2/3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

...
```

```
$ xloop --do .plans/tasks-delete-user-account.yml -i 3 --skip=review

Starting xloop with 3 iterations (review skipped)...
Agent: claude (default)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Iteration 1/3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Invocation 1: Implement]
Sending task context to agent...
[agent output streams here]
→ Agent selected: task-001 "Create DeleteAccountModal component"

[Invocation 2: Finalize]
Committing...
[agent output streams here]
→ Task completed and committed

...
```

---

### 8. Agent Integration

#### 8.1 Supported Agents
- **REQ-8.1.1**: `claude` — Claude Code CLI
- **REQ-8.1.2**: `opencode` — opencode CLI

#### 8.2 Agent Invocation
- **REQ-8.2.1**: Agents spawned as subprocesses
- **REQ-8.2.2**: Agent output streamed to console in real-time
- **REQ-8.2.3**: Agent receives structured prompt with:
  - Task description and acceptance criteria
  - Relevant file context
  - Project conventions (from AGENTS.md if exists)
  - Review feedback (during refactor pass)

#### 8.3 Agent Selection Priority
1. `--agent` flag (if provided)
2. `defaultAgent` in config file
3. Fallback: `claude`

---

### 9. AI-SDK Integration

#### 9.1 Usage
- **REQ-9.1.1**: Use AI-SDK for non-agent AI operations:
  - PRD generation and refinement (`--prd`)
  - Task list generation (`--prd-to-tasks`)
- **REQ-9.1.2**: The `--do` command uses the underlying agents (opencode/claude) directly, not AI-SDK

#### 9.2 Model Configuration
- **REQ-9.2.1**: Models configurable per operation type in config
- **REQ-9.2.2**: All models must be Anthropic models
- **REQ-9.2.3**: API key from `ANTHROPIC_API_KEY` environment variable

---

### 10. Error Handling

#### 10.1 Common Errors
| Error | Behavior |
|-------|----------|
| Missing API key | Exit with message directing to .env setup |
| Invalid PRD path | Exit with "File not found" message |
| Invalid tasks path | Exit with "File not found" message |
| Agent not found | Exit with installation instructions |
| Git not initialized | Exit with "Please initialize git first" |
| No uncommitted changes | Skip commit step (not an error) |
| Task failure | Exit immediately with error details |
| Network error | Retry 3 times with exponential backoff, then exit |

#### 10.2 Error Output Format
```
✗ Error: ANTHROPIC_API_KEY not found

Please create a .env file in your project root with:
ANTHROPIC_API_KEY=your-api-key-here

Get your API key at: https://console.anthropic.com/
```

---

## Technical Considerations

### Dependencies
- **Runtime**: Bun.js (latest stable)
- **AI**: AI-SDK with Anthropic provider
- **CLI Parsing**: Commander.js or similar
- **YAML**: js-yaml for task file parsing
- **Process**: Child process spawning for agents
- **Git**: simple-git or shell commands

### File System
- All paths relative to project root (where xloop is invoked)
- `.plans/` directory created automatically
- File operations should be atomic where possible

### Subprocess Management
- Agent subprocesses inherit current working directory
- stdout/stderr streamed to console
- Exit codes checked for success/failure

---

## Acceptance Criteria

### CLI Foundation
- [ ] `xloop --help` displays usage information
- [ ] `xloop --version` displays version
- [ ] `xloop` with no args shows help
- [ ] `.plans/` directory created on first use
- [ ] Config file created with defaults on first use

### PRD Management
- [ ] `xloop --prds` lists all PRDs with status
- [ ] `xloop --prd "text"` generates PRD interactively
- [ ] PRD includes all required sections
- [ ] Codebase analysis informs PRD content

### Task Management
- [ ] `xloop --status` shows incomplete task lists
- [ ] `xloop --prd-to-tasks <file>` generates tasks
- [ ] Tasks have correct schema with all fields
- [ ] Tasks ordered by dependency
- [ ] Manual task file editing supported

### Execution
- [ ] `xloop --do <file> -i <n>` executes n iterations
- [ ] Each iteration invokes agent 3 times (implement → review → finalize)
- [ ] `--skip=review` reduces to 2 invocations (implement → finalize)
- [ ] Agent receives correct context (AGENTS.md, tasks file, progress file)
- [ ] Agent handles task selection, file updates, and commits
- [ ] Failures exit immediately

### Agent Integration
- [ ] `--agent` flag overrides default
- [ ] Both opencode and claude agents supported
- [ ] Agent output streams in real-time

---

## Appendix: Example Session

```bash
# Start a new feature
$ xloop --prd "Add user avatar upload with cropping"

# Generate tasks from the PRD
$ xloop --prd-to-tasks .plans/prd-user-avatar-upload.md

# Check what needs to be done
$ xloop --status

# Do 5 iterations of work
$ xloop --do .plans/tasks-user-avatar-upload.yml -i 5

# Check progress
$ xloop --prds

# Continue with more iterations, skip review for speed
$ xloop --do .plans/tasks-user-avatar-upload.yml -i 3 --skip=review

# Use a different agent
$ xloop --do .plans/tasks-user-avatar-upload.yml -i 2 --agent opencode
```
