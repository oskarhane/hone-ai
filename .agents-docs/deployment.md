# Deployment

DEPLOYMENT STRATEGY: GitHub Actions–driven release workflow producing Bun-compiled binaries + manual npm publish.
CONTAINERIZATION: None detected (no Dockerfile/docker-compose).
CI/CD: GitHub Actions for CI validation, release (major/minor), and manual npm publish via OIDC trusted publishing.
HOSTING: NPM registry for package distribution; GitHub Releases for platform binaries.
ENVIRONMENT MANAGEMENT: CI uses workflow env vars; no repo .env patterns or secrets config beyond GitHub/NPM OIDC.

- Container orchestration: none detected (no K8s/Swarm/Compose).
- Cloud platforms: no AWS/GCP/Azure/Vercel/Netlify/Railway config files found.
- Infrastructure as Code: none detected (no Terraform/CloudFormation/Pulumi).
- Serverless/static: not indicated; CLI binary + npm package focus.
- Database/migrations: none detected (no SQL/migration tooling).
- Monitoring/logging: none detected.

Key evidence
- CI workflow: `.github/workflows/ci.yml`
- Release workflows: `.github/workflows/release-major.yml`, `.github/workflows/release-minor.yml`
- NPM publish: `.github/workflows/publish-npm-manual.yml`
- Build scripts: `package.json` (Bun compile targets Linux/macOS)

---

*This file is part of the AGENTS.md documentation system.*
