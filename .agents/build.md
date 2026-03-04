# Build System

BUILD SYSTEMS: [Bun (bun build/compile + bun test), npm scripts via package.json, GitHub Actions workflows]
BUILD COMMANDS: [bun run build, bun run build:linux, bun run build:macos, bun run tsc --noEmit]
LINT COMMANDS: [bun run lint:yaml, bun run check:yaml]
FORMAT COMMANDS: [bun run format, bun run format:yaml, prettier --write "**/*.ts", prettier --write "**/*.yml" "**/*.yaml"]
BUNDLING: [Bun bundler via bun build --compile --minify --sourcemap]

---

*This file is part of the AGENTS.md documentation system.*
