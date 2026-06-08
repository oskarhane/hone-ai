---
description: Pushes the current feature branch to the appropriate remote, opens a pull request with a concise description that classifies the change (new feature, fix, optimization, etc.) and notes any user-facing impact, then monitors CI checks in the background and auto-triggers /hone:fix if any fail. Use after /hone:review or /hone:fix, or at the end of /hone:auto, to publish a finished feature branch.
---

Publish a finished feature branch: push it to the right remote, open a well-formed pull request, then watch the PR's CI checks and drive `/hone:fix` automatically when a check goes red — looping until the checks are green or a round cap is hit.

## CRITICAL: main-context requirement

This skill MUST run in the **main conversation context**. It MUST NOT be invoked as a forked subagent (e.g. via the Agent/Task tool). The auto-fix step invokes `/hone:fix`, which reads `/hone:run` and forks an Agent per iteration — and forked agents cannot nest, so a nested fork will fail. If you are already running inside a forked agent, stop immediately and report that `/hone:pr` must be run from the top-level conversation.

## Step 0: Parse arguments

`$ARGUMENTS` is free-form text: an optional tasks-file path and an optional `--max-rounds N` flag.

- **tasks-file**: the first token if it looks like a path (e.g. `.plans/tasks-<feature>.yml`). If absent or it doesn't exist, fall back to the most recently modified `.plans/tasks-*.yml`. If none exists, leave `<tasks-file>` unresolved (the auto-fix step degrades gracefully — see Step 4).
- **max_rounds**: the value of `--max-rounds N` (also accept `--max-rounds=N`). Default `3` when absent.

Derive `<feature>` from the tasks-file name (`tasks-<feature>.yml` → `<feature>`) when one resolved.

## Step 1: Preconditions

Verify the environment before touching the remote. Stop with a clear, actionable message if any check fails:

1. **Git repo.** This skill is git + GitHub specific. If the repo is not git, stop and explain that `/hone:pr` only supports git + GitHub (`gh`).
2. **GitHub CLI.** Confirm `gh` is installed and authenticated (`gh auth status`). If not, stop and tell the user to install/authenticate `gh`.
3. **Base branch.** Determine the upstream default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`. Call it `<base>`.
4. **Not on base.** Get the current branch (`git branch --show-current`). If it equals `<base>`, stop — there is nothing to open a PR for.
5. **Clean tree.** Check for uncommitted changes (`git status --porcelain`). `/hone:run` and `/hone:fix` already commit their work, so the tree should be clean. If there are uncommitted changes, warn the user and ask whether to proceed (they may want to commit first).
6. **Commits ahead of base.** Confirm the branch has commits the base lacks (`git log <base>..HEAD --oneline`). If empty, stop — nothing to push.

## Step 2: Determine the remote & push

Choose the push remote from the project's actual remotes:

1. List remotes (`git remote -v`).
2. **Exactly one remote** → use it.
3. **Multiple remotes** → look for a push-target hint in `AGENTS.md` (e.g. an explicit statement that the project pushes to a fork). If a clear hint exists, use it. Otherwise, use `AskUserQuestion` to let the user pick which remote to push to (e.g. `origin` vs a fork remote).

Push the current branch and set upstream: `git push -u <remote> <branch>`.

## Step 3: Open the pull request

Build a **short, well-formed** description, then open the PR.

Gather context from:

- Commit subjects: `git log <base>..HEAD --oneline`.
- File overview: `git diff <base>...HEAD --stat`.
- When present: `.plans/prd-<feature>.md` and `.plans/progress-<feature>.txt`.

Derive a concise, conventional-commit-style title from the feature/branch and the changes (e.g. `feat(auth): add OAuth login`).

Write the body to this template. Keep it tight — bullets, not essays. Classify what kind of change this is (new feature, fix, optimization, replacement, refactor, or other) and lead with that. Most changes are not user-facing — only include the **User-facing impact** section when something a user actually interacts with (API, CLI, config, UI, output) changed; omit it entirely otherwise. Omit any section that has nothing:

```
## Summary
<1–2 sentences: what changed & why, and the kind of change — new feature / fix / optimization / replacement / refactor / other>

## Changes
- <bullet per notable change — what it does, not a play-by-play>

## User-facing impact
<Only when the change is user-facing: what users will now see or do differently (inputs and/or outputs). Drop this whole section for internal-only changes.>
```

Create the PR: `gh pr create --base <base> --title "<title>" --body "<body>"`. Let `gh` resolve the head branch (it handles fork `owner:branch` head refs automatically). Capture the PR URL and number (`<pr>`).

## Step 4: Monitor checks in the background → auto-fix loop

Watch the PR's CI checks and react when they fail. Run for at most `max_rounds` rounds:

1. **Launch the watch in the background.** Run `gh pr checks <pr> --watch --fail-fast` via the Bash tool with `run_in_background: true`. It exits `0` when all checks pass and non-zero when a check fails; the harness re-invokes this skill when the command exits, so continue from the result.
2. **Checks green (exit 0):** report success and go to Step 5.
3. **Checks red (non-zero exit):**
   - Collect the failure detail: `gh pr checks <pr>` for the failed-check list, and `gh run view <run-id> --log-failed` for the failing logs.
   - **If `<tasks-file>` is unresolved** (the branch wasn't produced by hone, so there's no task list to extend): do not auto-fix. Print which checks failed with their logs and suggest the user run `/hone:fix` manually, then go to Step 5 with an `unresolved` status.
   - **Otherwise, fix automatically.** Read the fix skill's instructions from `claude-plugin/skills/fix/SKILL.md` (sibling directory in the installed plugin) and execute it inline against `<tasks-file>` with the failing-check report (failed checks + logs) as the issues payload. Do not copy-paste or paraphrase those steps here — re-read that file and follow it verbatim, so this phase auto-syncs when the fix skill changes.

     Apply this override while executing it:
     - **Override fix Step 3 (the `AskUserQuestion` multi-select).** `/hone:pr` runs the fix unattended, so do NOT prompt the user to pick findings. Instead, **auto-select every failing-check finding** the fix skill's Step 2 resolved, and treat that auto-selection as the user's picks. Proceed to fix Step 4. If Step 2 resolved zero actionable findings, stop the loop and go to Step 5 with an `unresolved` status (the failure isn't something fix can act on — surface the logs to the user).

     Everything else in the fix skill is inherited unchanged — it appends the findings as new tasks, commits them, and runs its inline iteration loop over them. Suppress the fix skill's trailing `Next: /hone:prune…` line — this skill owns the transition.

   - After fix completes, push the new commits (`git push`) and **re-launch the watch** (next round).

4. **Round cap reached while still red:** stop, print the still-failing checks and their logs, and tell the user to inspect manually. Go to Step 5 with an `unresolved` status.

## Step 5: Final output

Report the outcome:

```
PR: <url>  (checks: green | fixed after <rounds> round(s) | unresolved after <max_rounds> round(s))
Next: /hone:prune to archive the feature once merged.
```
