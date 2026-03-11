---
name: init
description: Initialize hone in the current project directory. Creates .plans/ directory and hone.config.yml with default configuration.
---

Initialize hone for this project:

1. Check if `.plans/` directory exists. If not, create it.
2. Check if `.plans/hone.config.yml` exists. If not, create it with this default content:

```yaml
version: 2
agent: claude
claude:
  models: {}
opencode:
  models: {}
agentsDocsDir: '.agents/'
```

3. Report what was created:
   - If both already existed: "hone is already initialized in this directory."
   - Otherwise list what was created with checkmarks and what already existed.

4. If anything was created, show next steps:
   - "Generate project docs: /hone:agents-md"
   - "Generate a PRD: /hone:prd \"your feature description\""
