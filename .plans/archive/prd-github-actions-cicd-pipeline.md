I'll create a comprehensive PRD for adding GitHub Actions workflows to the hone-ai project. Let me structure this according to your requirements.

# PRD: GitHub Actions CI/CD Pipeline

## Overview
Implement comprehensive GitHub Actions workflows for the hone-ai project to automate testing, type checking, building, and releasing processes. This includes PR validation workflows and automated release management with artifact distribution.

## Goals
- Automate code quality validation on PRs and master commits
- Streamline release process with version management
- Distribute pre-built binaries for end users
- Ensure consistent build and test processes across environments
- Reduce manual overhead for maintainers

## Non-Goals
- Multi-platform builds (Windows/Linux) - focusing on macOS only
- Complex release approval workflows
- Automated deployment to package registries
- Integration with external monitoring/alerting systems

## Requirements

### Functional Requirements
- REQ-F-001: Run tests using `bun test` on all PRs and master commits
- REQ-F-002: Execute type checking on all PRs and master commits  
- REQ-F-003: Validate builds using `bun run build` on all PRs and master commits
- REQ-F-004: Create GitHub releases with automatic version bumping
- REQ-F-005: Build and attach macOS standalone binary to releases
- REQ-F-006: Support manual major and minor version releases via workflow dispatch
- REQ-F-007: Update package.json version and create git tags automatically
- REQ-F-008: Generate release notes from commit history

### Non-Functional Requirements
- REQ-NF-001: CI workflows must complete within 10 minutes
- REQ-NF-002: Release workflows must be idempotent and safe to re-run
- REQ-NF-003: Binary artifacts must be properly tagged with version numbers
- REQ-NF-004: Workflows must fail fast on first error to conserve resources

## Technical Considerations

**Architecture Decisions:**
- Use Bun runtime environment in GitHub Actions (actions/setup-bun)
- Store workflows in `.github/workflows/` directory
- Separate CI workflow from release workflows for modularity
- Use GitHub's built-in release functionality for artifact management

**Integration Points:**
- package.json version field for semantic versioning
- Git tags for release tracking
- GitHub Releases API for artifact attachment
- Bun build system for binary compilation

**Potential Challenges:**
- Bun compatibility with GitHub Actions runners
- Binary size and upload time constraints
- Version collision handling in concurrent releases
- Proper cleanup of build artifacts

## Acceptance Criteria
- [ ] CI workflow triggers on pull requests targeting master
- [ ] CI workflow triggers on commits to master branch
- [ ] All three validation steps (test, typecheck, build) run in CI
- [ ] CI workflow fails if any validation step fails
- [ ] Manual major release workflow creates new major version (e.g., 1.0.0 → 2.0.0)
- [ ] Manual minor release workflow creates new minor version (e.g., 1.1.0 → 1.2.0)
- [ ] Release workflows update package.json version field
- [ ] Release workflows create git tags with version numbers
- [ ] Standalone binary built with `bun run build` attached to GitHub release
- [ ] Release notes auto-generated from commit history
- [ ] Workflows use appropriate Bun action for consistent runtime

## Out of Scope
- Windows and Linux binary builds
- Automated patch version releases
- Complex branching strategies (gitflow, etc.)
- Integration testing beyond unit tests
- Security scanning or vulnerability checks
- Performance benchmarking in CI
- Notification systems for release status

## Open Questions
- Should pre-release versions (alpha/beta) be supported? -no
- How should release notes be formatted - conventional commits or simple changelog? - simple changelog
- Should there be any approval gates before major version releases? -yes, manual confirmation
- What should happen if a release build fails - retry logic or manual intervention? - manual
