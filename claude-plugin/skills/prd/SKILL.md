---
name: prd
description: Generate a Product Requirements Document (PRD) from a feature description. Analyzes the codebase, asks clarifying questions, then produces a structured PRD in .plans/. Use when planning a new feature.
---

Generate a PRD for the feature described in `$ARGUMENTS`.

## Step 1: Ensure .plans/ exists

Create `.plans/` directory if it doesn't exist.

## Step 2: Analyze the codebase

Read and analyze:
- `package.json` (project name, description, dependencies, scripts, devDependencies)
- Directory structure: check for `src/`, `lib/`, `components/`, `utils/`, `test/`, `__tests__/`
- Config files: `tsconfig.json`, `jest.config.*`, `vitest.config.*`, `.eslintrc*`, `tailwind.config.*`, `next.config.*`, `vite.config.*`, `docker-compose.yml`, `Dockerfile`
- `README.md` for project context
- `AGENTS.md` if it exists (for project conventions and patterns)
- Existing PRDs in `.plans/` for context on ongoing work

Summarize findings concisely (languages, frameworks, testing, build tools, project patterns).

## Step 3: Process references in description

If `$ARGUMENTS` contains file paths (e.g., `./docs/spec.md`, `src/component.js`):
- Read those files and incorporate their content as context

If `$ARGUMENTS` contains URLs (e.g., `https://example.com/api-docs`):
- Fetch those URLs and incorporate their content as context

If any reference fails to load, note it and ask the user about it.

## Step 4: Ask clarifying questions

Ask up to 5 clarifying questions, one at a time. Each question should:
- Be specific and focused
- Help clarify requirements, scope, UX, technical approach, or edge cases
- NOT ask about things already answerable from the codebase analysis

After each question, wait for the user's response. If the user says "done", stop asking and proceed.

When you have enough information (or after 5 questions), proceed to generation.

## Step 5: Generate the PRD

Write a comprehensive PRD following this exact template:

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
- REQ-F-001: <requirement>
- REQ-F-002: <requirement>

### Non-Functional Requirements
- REQ-NF-001: <requirement>

## Technical Considerations
Architecture decisions, integration points, potential challenges.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
Items explicitly not included in this feature.

## Open Questions
Any unresolved questions.
```

Use the codebase analysis and Q&A answers to make the PRD specific and actionable. Reference existing patterns, frameworks, and conventions from the project.

## Step 6: Save the PRD

Slugify the feature name:
- Lowercase
- Replace spaces with hyphens
- Remove non-alphanumeric characters (except hyphens)
- Collapse multiple hyphens
- Trim leading/trailing hyphens
- Max 50 characters

Write to `.plans/prd-<slug>.md`.

## Step 7: Next steps

Tell the user:
```
Saved to .plans/prd-<slug>.md

Review and edit the PRD, then run:
/hone:prd-to-tasks .plans/prd-<slug>.md
```
