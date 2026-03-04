# Build System

BUILD SYSTEMS: [Bun (bun build/compile + bun test), npm scripts via package.json, GitHub Actions workflows]

BUILD COMMANDS: [bun test, bun run build, bun run build:linux, bun run build:macos, bun run tsc --noEmit]

LINT COMMANDS: [bun run lint:yaml, bun run check:yaml]

FORMAT COMMANDS: [bun run format, bun run format:yaml, prettier --write "**/*.ts", prettier --write "**/*.yml" "**/*.yaml"]

BUNDLING: [Bun native compiler (bun build --compile) - produces standalone binaries for linux-x64 and darwin-arm64]

---

*This file is part of the AGENTS.md documentation system.*
