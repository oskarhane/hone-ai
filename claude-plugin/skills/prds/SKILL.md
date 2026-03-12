---
description: List all PRDs in .plans/ directory with their status and associated task files.
---

List all PRDs and their status:

1. Use Glob to find all `prd-*.md` files in `.plans/` directory (not in `.plans/archive/`).

2. For each PRD file:
   - Extract feature name from filename: `prd-<feature>.md` -> `<feature>`
   - Check if `.plans/tasks-<feature>.yml` exists
   - If task file exists, read and parse it to calculate status:
     - Count total tasks and completed tasks (status `completed` or `cancelled`)
     - If 0 completed: "not started"
     - If all completed: "completed"
     - Otherwise: "in progress (X/Y completed)"
   - If no task file: "no tasks generated"

3. Display results:
   ```
   PRDs in .plans/

     .plans/prd-<feature>.md
       Tasks: .plans/tasks-<feature>.yml (or "none")
       Status: <status>
   ```

4. If no PRDs found:
   ```
   No PRDs found in .plans/
   Create a PRD with: /hone:prd "your feature description"
   ```
