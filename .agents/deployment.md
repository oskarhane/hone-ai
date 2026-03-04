# Deployment

DEPLOYMENT STRATEGY: GitHub Actions–driven release workflow producing Bun-compiled binaries + manual npm publish
CONTAINERIZATION: None - CLI tool distributed as standalone binaries
CI/CD: GitHub Actions with 4 workflows (CI validation, release-minor, release-major, npm publish)
HOSTING: Local execution only - distributed via GitHub Releases (binaries) and npm registry (package)
ENVIRONMENT MANAGEMENT: Minimal - CI variables only (`CI=true`, Bun cache dir); no .env files or secrets beyond OIDC

## Pipeline Details

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to master | Type check → Tests → Build validation |
| `release-minor.yml` | Manual + CONFIRM | Bump minor, build binaries, create GitHub Release |
| `release-major.yml` | Manual + CONFIRM | Bump major, build binaries, create GitHub Release |
| `publish-npm-manual.yml` | Manual + CONFIRM | Publish to npm via OIDC trusted publishing |

## Build Artifacts

- `hone-linux` - Standalone Bun binary (linux-x64)
- `hone-macos` - Standalone Bun binary (darwin-arm64)
- `hone-ai` npm package for `bunx`/`npx` execution

## Security

- OIDC trusted publishing (no NPM_TOKEN stored)
- Confirmation gates on all release workflows
- `--frozen-lockfile` for dependency integrity
- Remote sync before commits to prevent conflicts

## Not Present

Containerization, cloud providers, IaC, databases, serverless, monitoring - appropriate for local CLI tool distribution model.

---

*This file is part of the AGENTS.md documentation system.*
