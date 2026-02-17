# AGENTS.md detection sources and tagging scheme

Date: 2026-02-17

## Supported signal sources

1. package.json
   - scripts for build/test/lint/format/yaml commands
   - dependencies/devDependencies for language/tool hints
2. Workflows
   - .github/workflows/**/\*.yml and .github/workflows/**/\*.yaml
   - extract run commands for build/test/lint/format/yaml
3. Docs
   - README.md, CONTRIBUTING.md, docs/\*_/_.md, and other top-level \*.md files
   - extract explicit command snippets and sectioned instructions
4. Configs
   - tool configs (eslint, prettier, bunfig, tsconfig, vite/webpack, jest/vitest, etc.)
   - used for language/tool detection and command inference
5. .agents-docs
   - existing generated detail files for build/testing/architecture/deployment/languages
   - treated as hints, not overrides

## Tag format

- Format: `<value> (<source>)`
- Source tags are short, deterministic, and stable across runs.
- Source tag conventions:
  - `package.json`
  - `workflow:<filename>` (e.g., workflow:ci.yml)
  - `doc:<path>` (e.g., doc:README.md, doc:docs/testing.md)
  - `config:<name>` (e.g., config:eslint, config:prettier, config:tsconfig)
  - `agents-docs:<file>` (e.g., agents-docs:testing.md)

Example: `npm test (package.json)`

## Aggregation rule

- Collect, do not override.
- Aggregate all signals from all sources for a section.
- Dedupe only exact normalized duplicates within the same source tag.
- Preserve multiple values when sources conflict.

## Determinism constraints

- Stable ordering: source type priority, then source tag, then value (lexicographic).
- Tags use relative paths and lowercase category prefixes.
- No timestamps or environment-specific values in tags or sorting.
