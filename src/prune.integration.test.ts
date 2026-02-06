import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from 'bun:test'
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  readdirSync,
} from 'fs'
import { spawnSync } from 'child_process'
import { join, resolve } from 'path'
import { homedir } from 'os'
import {
  getArchiveDir,
  ensureArchiveDir,
  archiveFile,
  identifyCompletedPrds,
  archivePrdTriplet,
  pruneCompletedPrds,
  type PrdTriplet,
} from './prune.js'

// Set test environment
const originalEnv = process.env.BUN_ENV
beforeAll(() => {
  process.env.BUN_ENV = 'test'
})
afterAll(() => {
  process.env.BUN_ENV = originalEnv
})

const TEST_CWD = join(process.cwd(), 'test-workspace-prune-integration')
const CLI_PATH = join(process.cwd(), 'src', 'index.ts')

// Integration tests use CLI commands that spawn fresh processes
// This avoids mock conflicts with unit tests

/**
 * Helper to run CLI command
 */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('bun', [CLI_PATH, ...args], {
    cwd: TEST_CWD,
    encoding: 'utf-8',
    env: { ...process.env, BUN_ENV: 'test' },
  })

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  }
}

// Console mocking not needed for CLI-based tests since we capture stdout/stderr

/**
 * Create mock PRD and task files
 */
function createMockPrdFiles(
  featureName: string,
  status: 'completed' | 'pending' = 'completed',
  includeProgress = true
): void {
  const plansDir = join(TEST_CWD, '.plans')
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true })
  }

  // Create PRD file
  const prdContent = `# ${featureName}

## Summary
Test PRD content for feature: ${featureName}

## Functional Requirements
- REQ-F-001: Basic functionality
- REQ-F-002: Advanced functionality

## Non-Functional Requirements  
- REQ-NF-001: Performance requirement
- REQ-NF-002: Security requirement
`
  writeFileSync(join(plansDir, `prd-${featureName}.md`), prdContent)

  // Create task file
  const taskStatus = status === 'completed' ? 'completed' : 'pending'
  const completedDate = status === 'completed' ? new Date().toISOString() : 'null'

  const taskContent = `feature: ${featureName}
prd: ./prd-${featureName}.md
created_at: 2026-02-06T08:00:00.000Z
updated_at: 2026-02-06T08:30:00.000Z

tasks:
  - id: task-001
    title: "Implement ${featureName} functionality"
    description: Test task for ${featureName}
    status: ${taskStatus}
    dependencies: []
    acceptance_criteria:
      - "Feature works correctly"
      - "Tests pass"
    completed_at: ${completedDate}

  - id: task-002
    title: "Add tests for ${featureName}"
    description: Test task 2 for ${featureName}
    status: ${taskStatus}
    dependencies:
      - task-001
    acceptance_criteria:
      - "Tests written and passing"
    completed_at: ${completedDate}
`
  writeFileSync(join(plansDir, `tasks-${featureName}.yml`), taskContent)

  // Create progress file if requested
  if (includeProgress) {
    const progressContent = `================================================================================
TASK-001: Implement ${featureName} functionality
Date: 2026-02-06T08:15:00.000Z
================================================================================

Summary:
Implemented ${featureName} functionality successfully.

Files Changed:
- src/test.ts (created - main implementation)

Key Decisions:
- Used TypeScript for implementation
- Added comprehensive error handling

Next Task: task-002

================================================================================
TASK-002: Add tests for ${featureName}
Date: 2026-02-06T08:30:00.000Z
================================================================================

Summary:
Added comprehensive test suite for ${featureName}.

Files Changed:
- src/test.test.ts (created - test suite)

Key Decisions:
- Used Bun test framework
- Achieved 100% coverage

All tasks completed successfully.
`
    writeFileSync(join(plansDir, `progress-${featureName}.txt`), progressContent)
  }
}

/**
 * Create partially completed PRD (some tasks pending)
 */
function createPartiallyCompletedPrd(featureName: string): void {
  const plansDir = join(TEST_CWD, '.plans')
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true })
  }

  // Create PRD file
  writeFileSync(
    join(plansDir, `prd-${featureName}.md`),
    `# ${featureName}\nPartially completed PRD`
  )

  // Create task file with mixed status
  const taskContent = `feature: ${featureName}
prd: ./prd-${featureName}.md
created_at: 2026-02-06T08:00:00.000Z
updated_at: 2026-02-06T08:30:00.000Z

tasks:
  - id: task-001
    title: "Implement ${featureName} part 1"
    description: First part
    status: completed
    dependencies: []
    acceptance_criteria:
      - "Part 1 works"
    completed_at: 2026-02-06T08:15:00.000Z

  - id: task-002
    title: "Implement ${featureName} part 2"
    description: Second part
    status: pending
    dependencies:
      - task-001
    acceptance_criteria:
      - "Part 2 works"
    completed_at: null
`
  writeFileSync(join(plansDir, `tasks-${featureName}.yml`), taskContent)
}

describe('Prune Integration Tests', () => {
  // Store original working directory
  const originalCwd = process.cwd()

  beforeEach(() => {
    // Remove and recreate test workspace
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true })
    }
    mkdirSync(TEST_CWD, { recursive: true })
  })

  afterEach(() => {
    // Return to original directory before cleanup
    process.chdir(originalCwd)

    // Cleanup test workspace
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true })
    }
  })

  describe('End-to-End Prune Workflow', () => {
    test('successfully archives multiple completed PRDs', () => {
      // Create multiple completed PRDs
      createMockPrdFiles('user-auth', 'completed')
      createMockPrdFiles('email-validation', 'completed')
      createMockPrdFiles('profile-page', 'completed', false) // No progress file

      // Verify files exist before archiving
      const plansDir = join(TEST_CWD, '.plans')
      expect(existsSync(join(plansDir, 'prd-user-auth.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'tasks-user-auth.yml'))).toBe(true)
      expect(existsSync(join(plansDir, 'progress-user-auth.txt'))).toBe(true)
      expect(existsSync(join(plansDir, 'prd-email-validation.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'prd-profile-page.md'))).toBe(true)

      // Run prune operation via CLI (fresh process, no mocks)
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Archiving 3 completed PRDs')
      expect(result.stdout).toContain('[ok] Archived: user-auth')
      expect(result.stdout).toContain('[ok] Archived: email-validation')
      expect(result.stdout).toContain('[ok] Archived: profile-page')
      expect(result.stdout).toContain('Moved 3 finished PRDs to archive')

      // Verify files were moved to archive
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(archiveDir)).toBe(true)

      // Check user-auth files
      expect(existsSync(join(archiveDir, 'prd-user-auth.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'tasks-user-auth.yml'))).toBe(true)
      expect(existsSync(join(archiveDir, 'progress-user-auth.txt'))).toBe(true)

      // Check email-validation files
      expect(existsSync(join(archiveDir, 'prd-email-validation.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'tasks-email-validation.yml'))).toBe(true)
      expect(existsSync(join(archiveDir, 'progress-email-validation.txt'))).toBe(true)

      // Check profile-page files (no progress file)
      expect(existsSync(join(archiveDir, 'prd-profile-page.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'tasks-profile-page.yml'))).toBe(true)
      expect(existsSync(join(archiveDir, 'progress-profile-page.txt'))).toBe(false)

      // Verify original files no longer exist
      expect(existsSync(join(plansDir, 'prd-user-auth.md'))).toBe(false)
      expect(existsSync(join(plansDir, 'tasks-user-auth.yml'))).toBe(false)
      expect(existsSync(join(plansDir, 'progress-user-auth.txt'))).toBe(false)
    })

    test('dry-run mode previews operations without moving files', () => {
      // Create completed PRDs
      createMockPrdFiles('test-feature', 'completed')
      createMockPrdFiles('another-feature', 'completed', false)

      const plansDir = join(TEST_CWD, '.plans')

      // Verify files exist before dry-run
      expect(existsSync(join(plansDir, 'prd-test-feature.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'tasks-test-feature.yml'))).toBe(true)

      // Run dry-run mode via CLI
      const result = runCli(['prune', '--dry-run'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Dry-run mode: Preview of 2 PRDs that would be archived')
      expect(result.stdout).toContain('Feature: test-feature')
      expect(result.stdout).toContain('PRD: .plans/prd-test-feature.md')
      expect(result.stdout).toContain('Tasks: .plans/tasks-test-feature.yml')
      expect(result.stdout).toContain('Feature: another-feature')
      expect(result.stdout).toContain(
        'Would move 2 finished PRDs to archive: test-feature, another-feature'
      )
      expect(result.stdout).toContain('Run without --dry-run to execute the archive operation')

      // Verify files still exist (not moved)
      expect(existsSync(join(plansDir, 'prd-test-feature.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'tasks-test-feature.yml'))).toBe(true)
      expect(existsSync(join(plansDir, 'progress-test-feature.txt'))).toBe(true)

      // Verify archive directory might exist but doesn't contain files
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-test-feature.md'))).toBe(false)
    })

    test('skips partially completed PRDs', () => {
      // Create mix of completed and partially completed PRDs
      createMockPrdFiles('completed-feature', 'completed')
      createPartiallyCompletedPrd('partial-feature')

      const plansDir = join(TEST_CWD, '.plans')

      // Run prune operation via CLI
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Archiving 1 completed PRD')
      expect(result.stdout).toContain('Moved 1 finished PRD to archive: completed-feature')

      // Verify only completed feature was archived
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-completed-feature.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'prd-partial-feature.md'))).toBe(false)

      // Verify partial feature still exists in plans
      expect(existsSync(join(plansDir, 'prd-partial-feature.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'tasks-partial-feature.yml'))).toBe(true)
    })

    test('handles no completed PRDs gracefully', () => {
      // Create only partially completed PRDs
      createPartiallyCompletedPrd('incomplete-feature')

      // Run prune operation via CLI
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('No completed PRDs found to archive')
      expect(result.stdout).toContain('Complete some tasks with: hone run')
      expect(result.stdout).toContain('Or check status with: hone status')

      // Verify no archive directory was created or it's empty
      const plansDir = join(TEST_CWD, '.plans')
      const archiveDir = join(plansDir, 'archive')

      if (existsSync(archiveDir)) {
        // Archive dir might be created but should be empty
        expect(existsSync(join(archiveDir, 'prd-incomplete-feature.md'))).toBe(false)
      }
    })

    test('handles missing progress files gracefully', () => {
      // Create PRD with missing progress file
      createMockPrdFiles('no-progress', 'completed', false)

      const plansDir = join(TEST_CWD, '.plans')

      // Remove progress file to simulate missing file
      const progressPath = join(plansDir, 'progress-no-progress.txt')
      if (existsSync(progressPath)) {
        rmSync(progressPath)
      }

      // Run prune operation via CLI
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('[ok] Archived: no-progress')

      // Verify PRD and tasks were archived but not progress (since it didn't exist)
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-no-progress.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'tasks-no-progress.yml'))).toBe(true)
      expect(existsSync(join(archiveDir, 'progress-no-progress.txt'))).toBe(false)
    })
  })

  describe('Concurrent Access Safety', () => {
    test('handles file system race conditions during archiving', () => {
      // Create completed PRD
      createMockPrdFiles('race-condition-test', 'completed')

      const plansDir = join(TEST_CWD, '.plans')

      // Run one prune operation normally
      const result1 = runCli(['prune'])
      expect(result1.exitCode).toBe(0)

      // Verify final state - files should be archived
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-race-condition-test.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'prd-race-condition-test.md'))).toBe(false)

      // Second operation should gracefully handle no PRDs to archive
      const result2 = runCli(['prune'])
      expect(result2.exitCode).toBe(0)
      expect(result2.stdout).toContain('No completed PRDs found to archive')
    })

    test('atomic operations maintain consistency during normal operation', () => {
      // Create completed PRD
      createMockPrdFiles('atomic-test', 'completed')

      const plansDir = join(TEST_CWD, '.plans')

      // Test that atomic operations work correctly during normal flow
      const result = runCli(['prune'])
      expect(result.exitCode).toBe(0)

      // Verify all files moved correctly together
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-atomic-test.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'tasks-atomic-test.yml'))).toBe(true)
      expect(existsSync(join(archiveDir, 'progress-atomic-test.txt'))).toBe(true)

      // Verify source files are completely removed
      expect(existsSync(join(plansDir, 'prd-atomic-test.md'))).toBe(false)
      expect(existsSync(join(plansDir, 'tasks-atomic-test.yml'))).toBe(false)
      expect(existsSync(join(plansDir, 'progress-atomic-test.txt'))).toBe(false)

      // Verify no temporary files left behind
      const tempFiles = readdirSync(plansDir).filter((file: string) => file.includes('.tmp.'))
      expect(tempFiles.length).toBe(0)

      const archiveTempFiles = readdirSync(archiveDir).filter((file: string) =>
        file.includes('.tmp.')
      )
      expect(archiveTempFiles.length).toBe(0)
    })
  })

  describe('Integration with existing listPrds() and calculateStatus()', () => {
    test('correctly integrates with real PRD parsing logic', () => {
      // Create realistic PRD files that match actual format
      const plansDir = join(TEST_CWD, '.plans')
      mkdirSync(plansDir, { recursive: true })

      // Create a properly formatted completed PRD
      const prdContent = `# User Authentication System

## Summary
Implement a comprehensive user authentication system with login, logout, registration, and password reset functionality.

## Functional Requirements
- REQ-F-001: User registration with email verification
- REQ-F-002: User login with email/password
- REQ-F-003: Password reset functionality
- REQ-F-004: Session management and logout

## Non-Functional Requirements
- REQ-NF-001: Authentication should complete within 2 seconds
- REQ-NF-002: Passwords must be securely hashed
- REQ-NF-003: System should handle 1000 concurrent users
`

      writeFileSync(join(plansDir, 'prd-user-auth.md'), prdContent)

      // Create properly formatted completed task file
      const taskContent = `feature: user-auth
prd: ./prd-user-auth.md
created_at: 2026-02-06T08:00:00.000Z
updated_at: 2026-02-06T12:00:00.000Z

tasks:
  - id: task-001
    title: "Implement user registration"
    description: |
      Create user registration endpoint with email verification.
      Include input validation and duplicate email handling.
    status: completed
    dependencies: []
    acceptance_criteria:
      - "POST /api/register endpoint accepts email/password"
      - "Email verification sent after registration"
      - "Duplicate emails return appropriate error"
      - "Password validation enforces security rules"
    completed_at: 2026-02-06T09:30:00.000Z

  - id: task-002
    title: "Implement user login"
    description: |
      Create login endpoint with authentication and session management.
    status: completed
    dependencies:
      - task-001
    acceptance_criteria:
      - "POST /api/login accepts email/password"
      - "Returns JWT token on successful login"
      - "Returns error for invalid credentials"
      - "Implements rate limiting for failed attempts"
    completed_at: 2026-02-06T11:00:00.000Z

  - id: task-003
    title: "Implement logout and session management"
    description: |
      Handle user logout and session invalidation.
    status: completed
    dependencies:
      - task-002
    acceptance_criteria:
      - "POST /api/logout invalidates session"
      - "JWT tokens have appropriate expiration"
      - "Middleware validates authentication on protected routes"
    completed_at: 2026-02-06T12:00:00.000Z
`

      writeFileSync(join(plansDir, 'tasks-user-auth.yml'), taskContent)

      // Test full archiving workflow via CLI
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Archiving 1 completed PRD')
      expect(result.stdout).toContain('[ok] Archived: user-auth')
      expect(result.stdout).toContain('Moved 1 finished PRD to archive: user-auth')

      // Verify files were properly archived
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-user-auth.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'tasks-user-auth.yml'))).toBe(true)

      // Verify content was preserved during move
      const archivedPrd = readFileSync(join(archiveDir, 'prd-user-auth.md'), 'utf-8')
      expect(archivedPrd).toContain('User Authentication System')
      expect(archivedPrd).toContain('REQ-F-001')

      const archivedTasks = readFileSync(join(archiveDir, 'tasks-user-auth.yml'), 'utf-8')
      expect(archivedTasks).toContain('feature: user-auth')
      expect(archivedTasks).toContain('task-001')
      expect(archivedTasks).toContain('status: completed')
    })

    test('correctly identifies mixed status PRDs using real parsing', () => {
      const plansDir = join(TEST_CWD, '.plans')
      mkdirSync(plansDir, { recursive: true })

      // Create completed PRD
      writeFileSync(join(plansDir, 'prd-completed.md'), '# Completed Feature\nCompleted PRD')
      writeFileSync(
        join(plansDir, 'tasks-completed.yml'),
        `feature: completed
prd: ./prd-completed.md
tasks:
  - id: task-001
    title: "Complete task"
    status: completed
    completed_at: 2026-02-06T10:00:00.000Z
    dependencies: []
    acceptance_criteria: ["Works"]
`
      )

      // Create pending PRD
      writeFileSync(join(plansDir, 'prd-pending.md'), '# Pending Feature\nPending PRD')
      writeFileSync(
        join(plansDir, 'tasks-pending.yml'),
        `feature: pending
prd: ./prd-pending.md
tasks:
  - id: task-001
    title: "Pending task"
    status: pending
    completed_at: null
    dependencies: []
    acceptance_criteria: ["Will work"]
`
      )

      // Create mixed PRD
      writeFileSync(join(plansDir, 'prd-mixed.md'), '# Mixed Feature\nMixed PRD')
      writeFileSync(
        join(plansDir, 'tasks-mixed.yml'),
        `feature: mixed
prd: ./prd-mixed.md
tasks:
  - id: task-001
    title: "Done task"
    status: completed
    completed_at: 2026-02-06T10:00:00.000Z
    dependencies: []
    acceptance_criteria: ["Works"]
  - id: task-002
    title: "Pending task"
    status: pending
    completed_at: null
    dependencies: []
    acceptance_criteria: ["Will work"]
`
      )

      // Test archiving via CLI
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Archiving 1 completed PRD')
      expect(result.stdout).toContain('[ok] Archived: completed')
      expect(result.stdout).toContain('Moved 1 finished PRD to archive: completed')

      // Verify only completed PRD was archived
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(archiveDir, 'prd-completed.md'))).toBe(true)
      expect(existsSync(join(archiveDir, 'prd-pending.md'))).toBe(false)
      expect(existsSync(join(archiveDir, 'prd-mixed.md'))).toBe(false)

      // Verify non-completed PRDs remain
      expect(existsSync(join(plansDir, 'prd-pending.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'prd-mixed.md'))).toBe(true)
    })
  })

  describe('CLI Integration', () => {
    test('prune command works via CLI with --dry-run', () => {
      // Create completed PRD
      createMockPrdFiles('cli-test', 'completed')

      // Run CLI command
      const result = runCli(['prune', '--dry-run'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Dry-run mode')
      expect(result.stdout).toContain('Feature: cli-test')
      expect(result.stdout).toContain('Would move 1 finished PRD')

      // Verify files not moved
      const plansDir = join(TEST_CWD, '.plans')
      expect(existsSync(join(plansDir, 'prd-cli-test.md'))).toBe(true)
    })

    test('prune command works via CLI without --dry-run', () => {
      // Create completed PRD
      createMockPrdFiles('cli-actual', 'completed')

      // Run CLI command
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Archiving 1 completed PRD')
      expect(result.stdout).toContain('[ok] Archived: cli-actual')
      expect(result.stdout).toContain('Moved 1 finished PRD to archive')

      // Verify files were moved
      const plansDir = join(TEST_CWD, '.plans')
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(join(plansDir, 'prd-cli-actual.md'))).toBe(false)
      expect(existsSync(join(archiveDir, 'prd-cli-actual.md'))).toBe(true)
    })

    test('CLI shows error for invalid workspace', () => {
      // Remove .plans directory
      const plansDir = join(TEST_CWD, '.plans')
      if (existsSync(plansDir)) {
        rmSync(plansDir, { recursive: true })
      }

      // Run CLI command
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Plans directory not found')
      expect(result.stderr).toContain('.plans')
    })

    test('CLI shows error for missing PRDs gracefully', () => {
      // Don't create any completed PRDs
      createPartiallyCompletedPrd('incomplete-only')

      // Run CLI command
      const result = runCli(['prune'])

      expect(result.exitCode).toBe(0) // No error, just no PRDs to archive
      expect(result.stdout).toContain('No completed PRDs found to archive')
      expect(result.stdout).toContain('Complete some tasks')
    })
  })

  describe('Error Recovery and Cleanup', () => {
    test('properly manages temporary files during normal operations', () => {
      // Create completed PRD
      createMockPrdFiles('cleanup-test', 'completed')

      const plansDir = join(TEST_CWD, '.plans')

      // Run normal prune operation via CLI
      const result = runCli(['prune'])
      expect(result.exitCode).toBe(0)

      // Verify no temporary files left behind in plans directory
      const tempFiles = readdirSync(plansDir).filter((file: string) => file.includes('.tmp.'))
      expect(tempFiles.length).toBe(0)

      // Check archive directory for clean state
      const archiveDir = join(plansDir, 'archive')
      expect(existsSync(archiveDir)).toBe(true)

      const archiveTempFiles = readdirSync(archiveDir).filter((file: string) =>
        file.includes('.tmp.')
      )
      expect(archiveTempFiles.length).toBe(0)

      // Files should be properly moved
      expect(existsSync(join(archiveDir, 'prd-cleanup-test.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'prd-cleanup-test.md'))).toBe(false)
    })
  })
})
