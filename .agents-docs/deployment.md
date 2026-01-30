# Deployment

DEPLOYMENT STRATEGY: CLI binary distribution + NPM package registry
CONTAINERIZATION: None - standalone compiled binaries via Bun
CI/CD: GitHub Actions with 4 workflows (CI validation, minor/major releases, manual NPM publish)
HOSTING: Self-hosted/local installation (CLI tool, not a hosted service)
ENVIRONMENT MANAGEMENT: CI environment variables only; no runtime env config

## Detailed Analysis

### Build & Distribution
- **Bun runtime** compiles to standalone executables
- Cross-platform binaries: `hone-linux` (~104MB) and `hone-macos` (~57MB)
- Distribution channels:
  1. **NPM**: `npm install -g hone-ai` (source package)
  2. **GitHub Releases**: Pre-built binary zips attached to releases

### CI/CD Pipeline (GitHub Actions)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to master | Type checking, tests, build validation |
| `release-minor.yml` | manual (workflow_dispatch) | Semantic version bump, binary build, GitHub release |
| `release-major.yml` | manual (workflow_dispatch) | Breaking change release with same process |
| `publish-npm-manual.yml` | manual | OIDC trusted publishing to NPM registry |

### Release Process
1. Manual trigger with "CONFIRM" safety gate
2. Version bump via `npm version` command
3. Build Linux + macOS binaries
4. Create zip archives: `hone-v{version}-{platform}.zip`
5. Push git tag, create GitHub Release with binaries attached
6. Separate manual NPM publish step (decoupled for flexibility)

### Security & Authentication
- **NPM Trusted Publisher**: OIDC authentication (no API tokens stored)
- Requires npm 11.5.1+ (Node.js 24)
- `id-token: write` permission for OIDC provenance

### Infrastructure
- **No containers**: Direct binary execution
- **No cloud deployment**: Local CLI tool
- **No database**: File-based state (`.plans/` directory)
- **No serverless**: Not applicable

### Missing/Not Present
- No Dockerfile or container orchestration
- No Terraform/CloudFormation IaC
- No `.env` files or secrets management
- No monitoring/logging infrastructure
- No deployment scripts (tool runs locally)

---

*This file is part of the AGENTS.md documentation system.*
