---
description: Show task status for incomplete task lists across all features. Use when the user wants to check progress on active features.
---

Show the status of all incomplete task lists:

1. Use Glob to find all `tasks-*.yml` files in `.plans/` directory.

2. For each task file found, read it and parse the YAML content. The schema is:

   ```yaml
   feature: <feature-name>
   tasks:
     - id: task-001
       title: '...'
       status: pending|in_progress|completed|failed|cancelled
       dependencies:
         - task-000
   ```

3. For each file, calculate:
   - Total task count
   - Completed count (tasks with status `completed` or `cancelled`)
   - Skip files where all tasks are completed/cancelled (fully done)

4. For incomplete files, find the next actionable task:
   - Find the first task with `status: pending` where ALL dependencies have status `completed` or `cancelled`
   - If no task has all deps satisfied, show "(waiting for dependencies)"

5. Display results. For each incomplete task file:

   ```
   .plans/<filename>
     Feature: <feature>
     Progress: X/Y tasks completed
     Next: <task-id> - <task-title>
   ```

6. If no incomplete task lists found:
   ```
   No incomplete task lists found.
   All tasks completed!
   ```
