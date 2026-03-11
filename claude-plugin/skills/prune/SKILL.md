---
name: prune
description: Archive completed PRDs and their associated files (tasks, progress) to .plans/archive/. Use --dry-run to preview.
---

Archive completed PRDs to `.plans/archive/`:

1. Parse `$ARGUMENTS` — check if the user requested a dry run (look for `--dry-run`, `dry-run`, `dry run`, `preview`, etc.).

2. Find all `prd-*.md` files in `.plans/` (not in archive/).

3. For each PRD:
   - Extract feature name: `prd-<feature>.md` -> `<feature>`
   - Check if `.plans/tasks-<feature>.yml` exists and read it
   - Parse task YAML and check if ALL tasks have status `completed` or `cancelled`
   - If all tasks done, this PRD is eligible for archiving

4. If no completed PRDs found:
   ```
   No completed PRDs found to archive.
   Complete some tasks with: /hone:run <task-file> -i <N>
   ```

5. If `--dry-run`:
   - List each completed PRD with its feature name
   - Show which files would be moved (prd, tasks, progress — only those that exist)
   - Show summary: "Would move N finished PRDs to archive: feature1, feature2"
   - Say "Run without --dry-run to execute."

6. If NOT dry-run:
   - Create `.plans/archive/` directory if it doesn't exist
   - Before moving any files, check for conflicts: verify none of the destination files already exist in `.plans/archive/` (prd, tasks, progress for each feature). If any conflicts found, list them and stop without moving anything.
   - For each completed PRD, move these files (if they exist) to `.plans/archive/`:
     - `.plans/prd-<feature>.md`
     - `.plans/tasks-<feature>.yml`
     - `.plans/progress-<feature>.txt`
   - Use Bash `mv` commands to move files
   - Report each successful archive: `[ok] Archived: <feature>`
   - Show summary: "Moved N finished PRDs to archive: feature1, feature2"
