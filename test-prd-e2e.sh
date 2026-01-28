#!/bin/bash
# End-to-end test for PRD generation

set -e

echo "=== Testing PRD generation with quick exit ==="

# Load environment
source .env

# Test 1: Quick exit with 'done'
echo "Test 1: User types 'done' immediately"
echo "done" | bun src/index.ts prd "simple test feature" 2>&1 | grep -q "Saved to .plans/prd-" && echo "✓ PRD created successfully" || exit 1

# Check file exists
if [ -f .plans/prd-simple-test-feature.md ]; then
  echo "✓ PRD file exists at correct location"
  rm .plans/prd-simple-test-feature.md
else
  echo "✗ PRD file not found"
  exit 1
fi

# Test 2: Verify model configuration
echo ""
echo "Test 2: Verify model uses correct format"
if grep -q "claude-sonnet-4-20250514" .plans/xloop.config.json; then
  echo "✓ Model configuration is correct"
else
  echo "✗ Model configuration is incorrect"
  exit 1
fi

# Test 3: Multiple answers
echo ""
echo "Test 3: User provides answers to questions"
printf "web interface\nreact\ndone\n" | timeout 60s bun src/index.ts prd "dashboard widget" 2>&1 | grep -q "Saved to .plans/prd-" && echo "✓ PRD created with Q&A" || exit 1

if [ -f .plans/prd-dashboard-widget.md ]; then
  echo "✓ PRD file exists"
  # Check file has content
  if [ $(wc -l < .plans/prd-dashboard-widget.md) -gt 10 ]; then
    echo "✓ PRD has substantial content"
  fi
  rm .plans/prd-dashboard-widget.md
else
  echo "✗ PRD file not found"
  exit 1
fi

echo ""
echo "=== All tests passed! ==="
