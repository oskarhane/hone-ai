---
name: prd-to-tasks
description: Generate a task breakdown YAML from a PRD file. Creates an ordered list of implementable tasks with dependencies and acceptance criteria. Use after creating or reviewing a PRD.
---

Generate tasks from the PRD file specified in `$ARGUMENTS`.

## Step 1: Read and validate the PRD

Read the PRD file at the path given in `$ARGUMENTS`.

Extract the feature name from the filename: `prd-<feature-name>.md` -> `<feature-name>`.

If the file doesn't exist or doesn't match the naming pattern, report the error and stop.

## Step 2: Generate tasks

Analyze the PRD and break it down into implementable tasks. Each task must have:

- **id**: Sequential identifier `task-001`, `task-002`, etc.
- **title**: Brief, actionable title (max 80 characters)
- **description**: Detailed description of what needs to be done (2-4 sentences)
- **status**: Always `pending` for new tasks
- **dependencies**: Array of task IDs that must complete first (empty array `[]` if none)
- **acceptance_criteria**: Array of specific, testable criteria (3-5 items each)
- **completed_at**: Always `null` for new tasks

Order tasks by implementation priority:
1. Dependencies and infrastructure first
2. Core abstractions and architectural decisions
3. Integration points between modules
4. Standard features
5. Polish and refinements

Keep dependency chains reasonable — don't over-constrain.

## Step 3: Write the task YAML

Write to `.plans/tasks-<feature-name>.yml` using this exact format:

```yaml
feature: <feature-name>
prd: ./prd-<feature-name>.md
created_at: <ISO-8601-datetime>
updated_at: <ISO-8601-datetime>

tasks:
  - id: task-001
    title: "<title>"
    description: |
      <description text>
    status: pending
    dependencies: []
    acceptance_criteria:
      - "<criterion 1>"
      - "<criterion 2>"
      - "<criterion 3>"
    completed_at: null

  - id: task-002
    title: "<title>"
    description: |
      <description text>
    status: pending
    dependencies:
      - task-001
    acceptance_criteria:
      - "<criterion 1>"
      - "<criterion 2>"
    completed_at: null
```

IMPORTANT formatting rules:
- Use `|` for multi-line description blocks
- Quote titles and acceptance criteria strings with double quotes
- Use `[]` for empty dependencies arrays
- Use `null` (unquoted) for completed_at
- Blank line between task entries

## Step 4: Report results

```
Generated <N> tasks
Saved to .plans/tasks-<feature-name>.yml

Now run:
/hone:run .plans/tasks-<feature-name>.yml -i <N>
```
