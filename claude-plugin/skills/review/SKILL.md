---
description: Performs a strict end-of-feature maintainability audit of the current branch — abstraction quality, file size, spaghetti growth, missed code-judo simplifications. Runs the audit in the hone-auditor sub-agent and relays its result to chat. Use after /hone:run finishes a feature.
---

# Hone Review

Run the strict end-of-feature maintainability audit in a dedicated sub-agent, then relay its result.

## Arguments

`$ARGUMENTS` is optional. If present, treat it as `<tasks-file>` (e.g. `.plans/tasks-<feature>.yml`). If absent, pick the most recently modified `tasks-*.yml` in `.plans/`. Derive `<feature>` from the filename. Do NOT write any file — this skill outputs to chat exclusively.

## Run the audit

Launch the `hone-auditor` subagent. Pass it:

- The resolved `<tasks-file>` path (it derives `<feature>` for scoping language).
- Tell it to audit the current branch.

The sub-agent runs the full audit in its own fresh context and returns the audit as its final message. That message is a tool result — it is NOT shown to the user. So once it returns:

**Relay the sub-agent's entire output to chat verbatim, preserving its closing line exactly.** Do not summarize, reorder, or rewrite it. The closing line is a contract:

- `Run /hone:fix <tasks-file> the above blocking issues` — `/hone:fix` resolves `the above blocking issues` as a back-reference to the relayed audit.
- `Nothing blocking.` followed by `Next: /hone:pr …` — `/hone:auto` parses the exact `Nothing blocking.` text to end its review→fix loop.

Both must appear verbatim in the chat output for the rest of the chain to work.
