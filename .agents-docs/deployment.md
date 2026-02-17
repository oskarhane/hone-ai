# Deployment

DEPLOYMENT STRATEGY: CLI binary distribution + npm package publishing via GitHub Actions release workflows  
CONTAINERIZATION: None; no Docker/Podman config found  
CI/CD: GitHub Actions for CI, release (major/minor), and manual npm publish  
HOSTING: GitHub Releases for binaries; npm registry for package distribution  
ENVIRONMENT MANAGEMENT: CI env vars only (e.g., `CI`, `BUN_INSTALL_CACHE_DIR`); no `.env` usage detected  

- **Container orchestration:** none; no Kubernetes/Swarm/Compose files detected  
- **Cloud platforms:** no AWS/GCP/Azure/Vercel/Netlify/Railway configs; distribution is GitHub + npm  
- **CI/CD details:** workflows in `.github/workflows/ci.yml`, `.github/workflows/release-minor.yml`, `.github/workflows/release-major.yml`, `.github/workflows/publish-npm-manual.yml`  
- **IaC:** none; no Terraform/CloudFormation/Pulumi files detected  
- **Serverless/static hosting:** not applicable; CLI tool, no static site config  
- **DB/migrations:** no database or migration artifacts detected  
- **Env config:** no `.env` patterns or runtime env files detected; config appears via files and CLI, see `.plans/hone.config.yml`  
- **Monitoring/logging:** none configured in repo; no observability setup detected  
- **Deploy/build scripts:** in `package.json` (`build:linux`, `build:macos`, `build`)  

If you want, I can map a concrete release checklist from these workflows or add deployment docs for a target platform.

---

*This file is part of the AGENTS.md documentation system.*
