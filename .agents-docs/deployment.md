# Deployment

DEPLOYMENT STRATEGY: CLI binary distribution + NPM package registry
CONTAINERIZATION: None - no Docker/container configuration
CI/CD: GitHub Actions with comprehensive validation and release pipelines
HOSTING: NPM registry for package distribution; GitHub Releases for platform-specific binaries
ENVIRONMENT MANAGEMENT: CI-based with Bun caching; no .env files or runtime config

## Detailed Analysis

### CI/CD Pipeline Structure

**4 GitHub Actions Workflows:**

1. **ci.yml** - Continuous validation on push/PR to master:
   - TypeScript type checking (`tsc --noEmit`)
   - Bun test suite execution
   - Build validation (compiles Linux + macOS binaries)
   - Dependency caching via `actions/cache`
   - 10-minute timeout with fail-fast strategy

2. **release-minor.yml** - Manual minor version releases:
   - Requires explicit "CONFIRM" input (safety gate)
   - Bumps minor version via `npm version minor`
   - Builds platform binaries (Linux x64, macOS ARM64)
   - Creates zipped release archives
   - Pushes git tag and creates GitHub Release
   - Auto-generates changelog from commit history

3. **release-major.yml** - Manual major version releases:
   - Identical structure to minor, for breaking changes
   - Separate workflow for semantic versioning clarity

4. **publish-npm-manual.yml** - Manual NPM publication:
   - Uses OIDC trusted publishing (no NPM_TOKEN secret)
   - Verifies package.json version matches input
   - Requires Node.js 24+ with npm 11.5.1+ for provenance
   - Decoupled from release (allows review before publish)

### Build Artifacts

**Binary Targets** (Bun native compilation):
- `hone-linux` - Linux x64 executable
- `hone-macos` - macOS ARM64 executable

**Distribution Format:**
- Zipped archives: `hone-v{VERSION}-{platform}.zip`
- Contains single `hone` binary in versioned folder
- Attached to GitHub Releases

### Key Infrastructure Patterns

1. **No containerization** - Direct binary distribution, no Docker
2. **Bun runtime** - Version 1.2.21 pinned in workflows
3. **Semantic versioning** - Strict x.y.z format validation
4. **Confirmation gates** - Manual releases require "CONFIRM" input
5. **Caching** - Bun dependency cache keyed on `bun.lock` hash
6. **OIDC auth** - NPM trusted publisher (no secrets for npm publish)

### Operational Considerations

- **Release decoupling**: GitHub Release created before NPM publish
- **Provenance**: NPM publish includes OIDC-based attestation
- **No secrets management**: Uses `GITHUB_TOKEN` and OIDC only
- **Artifact cleanup**: Build artifacts removed after release creation
- **Remote sync**: Workflows pull latest before committing version bumps

---

*This file is part of the AGENTS.md documentation system.*
