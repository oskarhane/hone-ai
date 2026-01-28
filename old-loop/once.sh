#!/bin/bash

# Default to claude
AGENT="claude"
PRD_NAME=""

# Parse arguments
for arg in "$@"; do
  case $arg in
    --agent=*)
      AGENT="${arg#*=}"
      shift
      ;;
    --prd=*)
      PRD_NAME="${arg#*=}"
      shift
      ;;
  esac
done

# Validate agent
if [ "$AGENT" != "claude" ] && [ "$AGENT" != "opencode" ]; then
  echo "Error: agent must be either 'claude' or 'opencode'"
  exit 1
fi

if [ "$AGENT" = "claude" ]; then
  claude -p "@.plans/progress-$PRD_NAME.txt @old-loop/xloop/prompt.md @.plans/tasks-$PRD_NAME.yml @AGENTS.md"
else
  opencode run "Follow the instructions in the xloop prompt. @.plans/progress-$PRD_NAME.txt @old-loop/prompt.md @.plans/tasks-$PRD_NAME.yml @AGENTS.md"
fi
