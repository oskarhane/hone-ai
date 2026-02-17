# Build System

BUILD SYSTEMS: [Bun]
BUILD COMMANDS:

- `bun test` - Run tests
- `bun run build` - Build Linux and macOS binaries
- `bun run build:linux` - Compile to standalone Linux x64 binary
- `bun run build:macos` - Compile to standalone macOS ARM64 binary
- `bun run format` - Format TypeScript with Prettier
- `bun run format:yaml` - Format YAML files with Prettier
- `bun run lint:yaml` - Lint YAML with yamllint
- `bun run check:yaml` - Combined YAML lint + format check

BUNDLING: [Bun's built-in bundler/compiler]

NOTES:

- Project uses Bun as runtime, package manager (bun.lock), and bundler
- Compiles to standalone executables using `bun build --compile`
- Targets: Linux x64 and macOS ARM64
- No webpack/vite/parcel - uses Bun's native bundling
- TypeScript source executed directly via Bun (no transpilation step for dev)

---

_This file is part of the AGENTS.md documentation system._
