---
name: extend-prd
description: Add new requirements to an existing PRD with interactive refinement and task generation. Supports file paths and URLs in requirement description.
---

Extend an existing PRD with new requirements.

## Step 1: Parse arguments

`$ARGUMENTS` contains: `<prd-file> <requirement-description>`

The first argument is the PRD file path (e.g., `.plans/prd-user-auth.md`).
Everything after the first space-separated path is the requirement description.

Read the PRD file. If it doesn't exist, report the error and stop.

Extract the feature name from the filename: `prd-<feature>.md` -> `<feature>`.

## Step 2: Read context

- Read `AGENTS.md` if it exists (for project conventions)
- Read `.plans/tasks-<feature>.yml` if it exists (to understand existing task structure)
- Read `.plans/progress-<feature>.txt` if it exists (to understand what's been done)

## Step 3: Process references

If the requirement description contains file paths (e.g., `./docs/spec.md`):
- Read those files and use as context

If the requirement description contains URLs (e.g., `https://docs.stripe.com/api`):
- Fetch those URLs and use as context

If references fail to load, ask the user about their intended content.

## Step 4: Ask clarifying questions

Ask up to 3 clarifying questions about the new requirement, one at a time.
Focus on:
- Scope of the new requirement relative to existing PRD
- Integration with existing requirements
- Edge cases specific to the addition

If the user says "done", stop asking and proceed.

## Step 5: Update the PRD

Read the existing PRD and update it:

1. **Requirements section**: Add new requirements with sequential IDs
   - Find the highest existing REQ-F-XXX and REQ-NF-XXX numbers
   - Assign new IDs continuing from the highest number
   - Add under the appropriate subsection (Functional or Non-Functional)

2. **Other sections**: Update as needed:
   - Goals: Add new goals if the requirement introduces them
   - Technical Considerations: Add new technical concerns
   - Acceptance Criteria: Add new acceptance criteria
   - Open Questions: Add any unresolved questions

3. Write the updated PRD back to the same file.

## Step 6: Update or create tasks

If `.plans/tasks-<feature>.yml` exists:
- Read it and find the highest existing task ID number
- Generate new tasks for the new requirements only
- New task IDs continue from the highest existing (e.g., if task-005 exists, new tasks start at task-006)
- Append new tasks to the existing tasks array
- Update `updated_at` timestamp
- Write the updated file

If no task file exists, tell the user:
```
PRD updated. Generate tasks with:
/hone:prd-to-tasks .plans/prd-<feature>.md
```

## Step 7: Report results

```
Updated .plans/prd-<feature>.md with new requirements
Added <N> new requirements (REQ-F-XXX through REQ-F-YYY)
```

If tasks were updated:
```
Added <N> new tasks (task-XXX through task-YYY) to .plans/tasks-<feature>.yml
```
