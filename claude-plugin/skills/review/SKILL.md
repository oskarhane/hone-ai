---
description: Performs a strict end-of-feature maintainability audit of the current branch — abstraction quality, file size, spaghetti growth, missed code-judo simplifications. Chat output only. Use after /hone:run finishes a feature.
---

# Hone Review

Unusually strict review of implementation quality, maintainability, and abstraction health. Push for **ambitious** restructurings — "code judo" moves that preserve behavior while making the code dramatically simpler, smaller, and more direct. Delete complexity; don't rearrange it.

## Arguments

`$ARGUMENTS` is optional. If present, treat it as `<tasks-file>` (e.g. `.plans/tasks-<feature>.yml`). If absent, pick the most recently modified `tasks-*.yml` in `.plans/`. Derive `<feature>` from the filename and use it for scoping language only. Do NOT write any file — this skill outputs to chat exclusively.

## Core Prompt

> Deep code-quality audit of the current branch. Rethink structure to improve quality without changing behavior. Improve abstractions, modularity, succinctness, legibility. Be ambitious — if restructuring the codebase yields a clearly better implementation, go for it. Measure twice, cut once.

## Standards

0. **Be ambitious about structural simplification.** Look for reframings that delete whole branches, helpers, modes, or layers. Prefer the solution that feels inevitable in hindsight. If you can delete complexity instead of moving it, push for that.

1. **Don't let a file cross 1k lines without strong reason.** Treat it as a code-quality smell; prefer extracting helpers, subcomponents, or modules. Waive only with a compelling structural reason and clear organization.

2. **No spaghetti growth in existing code.** Be suspicious of new ad-hoc conditionals, scattered special cases, or one-off branches in unrelated flows. Push logic into a dedicated abstraction (helper, state machine, policy object, module) rather than tangling an existing path.

3. **Clean the design, don't just accept working code.** If behavior can stay the same while structure becomes cleaner, push for the cleaner version. Prefer removing moving pieces over spreading complexity around.

4. **Prefer direct, boring, maintainable code over hacky or magical code.** Flag thin abstractions, identity wrappers, pass-through helpers, and generic mechanisms that hide simple data-shape assumptions.

5. **Push on type and boundary cleanliness.** Question unnecessary optionality, `unknown`, `any`, or cast-heavy code. Prefer explicit typed models. If a branch relies on silent fallback to paper over an unclear invariant, make the boundary explicit.

6. **Keep logic in the canonical layer; reuse existing helpers.** Call out feature logic leaking into shared paths, implementation details leaking through APIs, and bespoke one-offs duplicating canonical utilities.

7. **Flag unnecessary sequential orchestration and non-atomic updates.** If independent work is serialized for no reason, ask for parallelism. If related updates can leave state half-applied, push for atomicity. Don't micro-optimize, but flag avoidable brittleness.

## Primary Review Questions

- Is there a code-judo move that makes this dramatically simpler?
- Can this be reframed so fewer concepts, branches, or layers are needed?
- Did the diff add branching where a better abstraction should exist?
- Did a cohesive module become more coupled, stateful, or harder to scan?
- Is this logic in the right file/layer? Past a healthy size boundary?
- Are repeated conditionals signalling a missing model or helper?
- Is the abstraction earning its keep, or just wrapping?
- Did the diff introduce casts, optionality, or ad-hoc shapes that obscure the real invariant?
- Is orchestration more sequential or less atomic than it needs to be?

## Flag Aggressively

- Implementations where a cleaner reframing could delete whole categories of complexity.
- Refactors that move code without reducing concept count.
- Files crossing 1000 lines because of this PR.
- New conditionals bolted onto unrelated paths; one-off booleans or nullable modes.
- Feature-specific logic leaking into general-purpose modules.
- Generic "magic" handling that hides simple structure.
- Thin wrappers, identity abstractions, unnecessary casts/`any`/`unknown`/optional params.
- Copy-pasted logic instead of extracted helpers.
- Edge-case handling shoved into an already busy function.
- Refactors that pass tests but reduce modularity/readability.
- "Temporary" branching likely to become permanent debt.
- Bespoke helpers where a canonical utility already exists.
- Logic in the wrong layer/package.
- Avoidable sequential async flow; partial-update logic that should be atomic.

## Preferred Remedies

- Delete a layer of indirection rather than polish it.
- Reframe the state model so conditionals disappear.
- Move the ownership boundary so the feature becomes a natural extension of an existing abstraction.
- Turn special cases into a simpler default flow.
- Extract helpers / split large files / move logic behind a dedicated abstraction.
- Replace condition chains with a typed model or explicit dispatcher.
- Separate orchestration from business logic.
- Collapse duplicate branches; delete wrappers that don't clarify the API.
- Reuse the canonical helper instead of near-duplicating it.
- Make type boundaries explicit so control flow simplifies.
- Parallelize independent work when it also simplifies orchestration.
- Restructure related updates into atomic flow.

Don't settle for "rename this" feedback when the issue is structural. Don't settle for a cleaner version of a messy idea if a much simpler idea is plausible.

## Tone

Direct, serious, demanding. Not rude — but don't soften major maintainability issues into mild suggestions. If the code makes the codebase messier, say so.

Good phrases:

- `this pushes the file past 1k lines. can we decompose this first?`
- `this adds another special-case branch into an already busy flow. can we move this behind its own abstraction?`
- `this works, but makes the surrounding code more spaghetti. let's keep the behavior and restructure the implementation.`
- `feels like feature logic leaking into a shared path. can we isolate it?`
- `this abstraction seems unnecessary. can we keep the direct flow?`
- `why the cast/optional here? can we make the boundary explicit instead?`
- `looks like a bespoke helper for something we already have. can we reuse the canonical one?`
- `i think there's a code-judo move here. can we reframe this so these branches disappear?`
- `this refactor moves complexity around without deleting it. can we make the model itself simpler?`

## Output

Priority order:

1. Structural code-quality regressions
2. Missed code-judo / dramatic simplifications
3. Spaghetti / branching complexity increases
4. Boundary / abstraction / type-contract problems
5. File-size and decomposition concerns
6. Modularity and abstraction issues
7. Legibility and maintainability

Prefer a small number of high-conviction comments over many cosmetic nits.

## Approval Bar

Don't approve merely because behavior seems correct. Required:

- no structural regression
- no obvious missed simplification when a path is visible
- no unjustified file-size explosion
- no spaghetti-growth from special-case branching
- no hacky/magical abstraction that obscures reasoning
- no unnecessary wrapper/cast/optionality churn
- no architecture-boundary leak or canonical-helper duplication
- no missed obvious decomposition that would materially improve maintainability

Presumptive blockers unless justified:

- preserves incidental complexity when a code-judo move would delete it
- pushes a file from <1000 to >1000 lines
- adds ad-hoc branching that tangles an existing flow
- scatters feature checks across shared code
- adds unnecessary abstraction/wrapper/cast-heavy contract
- duplicates a canonical helper or puts logic in the wrong layer

If unmet, leave explicit, actionable feedback and push for cleaner decomposition.

## Closing Output

End the audit based on what you found:

- **If there are blocking issues** (anything under Approval Bar / Presumptive blockers, or priority 1–3 findings that warrant fixing), print this single line with the resolved tasks-file path (not a placeholder):

  ```
  Run /hone:fix <resolved-tasks-file> the above blocking issues
  ```

  Example: `Run /hone:fix .plans/tasks-user-auth.yml the above blocking issues`. The phrase `the above blocking issues` is intentional — `/hone:fix` resolves it as a back-reference to the audit you just printed.

- **If there are no blocking issues**, do NOT suggest `/hone:fix`. Print a short, warm closing line, e.g.:

  ```
  Nothing blocking. Branch looks clean.
  ```
