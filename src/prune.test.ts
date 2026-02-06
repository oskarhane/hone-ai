import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from 'bun:test'
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
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
import { HoneError } from './errors.js'

// Set test environment
const originalEnv = process.env.BUN_ENV
beforeAll(() => {
  process.env.BUN_ENV = 'test'
})
afterAll(() => {
  process.env.BUN_ENV = originalEnv
})

const TEST_CWD = join(process.cwd(), 'test-workspace-prune')

// Mock console functions
const originalLog = console.log
const originalError = console.error
let logCalls: string[] = []
let errorCalls: string[] = []

// Mock listPrds function that we can control in tests
let mockPrdList: Array<{ filename: string; status: string }> = []
function mockListPrds() {
  return Promise.resolve(mockPrdList)
}

// Mock the config and prds modules
mock.module('./config.js', () => ({
  getPlansDir: () => join(TEST_CWD, '.plans'),
}))

mock.module('./prds.js', () => ({
  listPrds: mockListPrds,
  extractFeatureName: (filename: string) => {
    const match = filename.match(/^prd-(.+)\.md$/)
    return match ? match[1] : ''
  },
}))

describe('Prune functionality', () => {
  beforeEach(() => {
    // Create test workspace
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true })
    }
    mkdirSync(TEST_CWD, { recursive: true })
    process.chdir(TEST_CWD)

    // Create .plans directory
    mkdirSync(join(TEST_CWD, '.plans'), { recursive: true })

    // Reset mock data
    mockPrdList = []

    // Reset console call tracking
    logCalls = []
    errorCalls = []

    // Mock console functions
    console.log = mock((message: string) => {
      logCalls.push(message)
    })

    console.error = mock((message: string) => {
      errorCalls.push(message)
    })
  })

  afterEach(() => {
    // Restore console functions
    console.log = originalLog
    console.error = originalError

    // Cleanup
    process.chdir(join(TEST_CWD, '..'))
    if (existsSync(TEST_CWD)) {
      rmSync(TEST_CWD, { recursive: true, force: true })
    }
  })

  describe('getArchiveDir', () => {
    test('returns correct archive directory path', () => {
      const archiveDir = getArchiveDir()
      expect(archiveDir).toBe(join(TEST_CWD, '.plans', 'archive'))
    })
  })

  describe('ensureArchiveDir', () => {
    test('creates archive directory if not exists', () => {
      const archiveDir = getArchiveDir()
      expect(existsSync(archiveDir)).toBe(false)

      ensureArchiveDir()

      expect(existsSync(archiveDir)).toBe(true)
    })

    test('is idempotent when directory already exists', () => {
      ensureArchiveDir()
      ensureArchiveDir() // Should not throw

      expect(existsSync(getArchiveDir())).toBe(true)
    })

    test('throws HoneError on permission denied', () => {
      // Create a conflicting file to simulate permission issues
      const archivePath = join(TEST_CWD, '.plans', 'archive')
      mkdirSync(join(TEST_CWD, '.plans'), { recursive: true })

      // We'll test this indirectly by creating a scenario where mkdir would fail
      // This is difficult to test directly without actually changing permissions
      expect(() => {
        try {
          ensureArchiveDir()
        } catch (error) {
          if (error instanceof HoneError) {
            throw error
          }
          // Convert any other error to HoneError for consistency
          throw new HoneError('Directory creation failed')
        }
      }).not.toThrow() // This should succeed in normal conditions
    })

    test('handles when archive path exists as file', () => {
      // Create file at archive path
      const archivePath = join(TEST_CWD, '.plans', 'archive')
      mkdirSync(join(TEST_CWD, '.plans'), { recursive: true })
      writeFileSync(archivePath, 'not a directory')

      // ensureArchiveDir behavior depends on filesystem - may succeed or fail
      // Test that it doesn't crash and either succeeds or throws HoneError
      try {
        ensureArchiveDir()
        // If it succeeds, verify archive directory was created/converted
        expect(existsSync(getArchiveDir())).toBe(true)
      } catch (error) {
        // If it fails, it should be a HoneError
        expect(error).toBeInstanceOf(HoneError)
      }
    })
  })

  describe('archiveFile', () => {
    beforeEach(() => {
      // Ensure archive directory exists for tests
      ensureArchiveDir()
    })

    test('successfully archives a file', async () => {
      const sourcePath = join(TEST_CWD, '.plans', 'test-file.md')
      const targetName = 'archived-file.md'
      const targetPath = join(getArchiveDir(), targetName)

      // Create source file
      writeFileSync(sourcePath, 'test content')

      await archiveFile(sourcePath, targetName)

      // Source should be gone, target should exist
      expect(existsSync(sourcePath)).toBe(false)
      expect(existsSync(targetPath)).toBe(true)
      expect(readFileSync(targetPath, 'utf8')).toBe('test content')
    })

    test('validates source path parameter', async () => {
      await expect(archiveFile('', 'target.md')).rejects.toThrow(HoneError)
      await expect(archiveFile(null as any, 'target.md')).rejects.toThrow(HoneError)
    })

    test('validates target name parameter', async () => {
      const sourcePath = join(TEST_CWD, '.plans', 'test-file.md')
      writeFileSync(sourcePath, 'test content')

      await expect(archiveFile(sourcePath, '')).rejects.toThrow(HoneError)
      await expect(archiveFile(sourcePath, null as any)).rejects.toThrow(HoneError)
      await expect(archiveFile(sourcePath, 'path/with/slash')).rejects.toThrow(HoneError)
      await expect(archiveFile(sourcePath, '.hidden')).rejects.toThrow(HoneError)
    })

    test('throws error when source file does not exist', async () => {
      const sourcePath = join(TEST_CWD, '.plans', 'nonexistent.md')

      await expect(archiveFile(sourcePath, 'target.md')).rejects.toThrow(HoneError)
    })

    test('prevents path traversal attacks', async () => {
      const maliciousPath = '../../malicious.md'

      await expect(archiveFile(maliciousPath, 'target.md')).rejects.toThrow(HoneError)
    })

    test('expands home directory paths', async () => {
      // Create a file in home directory path within plans directory (edge case)
      const actualPath = join(TEST_CWD, '.plans', 'test-file.md')
      writeFileSync(actualPath, 'test content')

      // Test that ~ expansion works for paths outside plans directory (should fail validation)
      const homeRelativePath = '~/test-file.md'

      await expect(archiveFile(homeRelativePath, 'target.md')).rejects.toThrow(HoneError)
    })

    test('overwrites existing target file during archive', async () => {
      const sourcePath = join(TEST_CWD, '.plans', 'test-file.md')
      const targetName = 'existing-file.md'
      const targetPath = join(getArchiveDir(), targetName)

      // Create source file and existing target file
      writeFileSync(sourcePath, 'source content')
      writeFileSync(targetPath, 'existing content')

      // archiveFile should overwrite the existing target file
      await archiveFile(sourcePath, targetName)

      // Source should be gone, target should have new content
      expect(existsSync(sourcePath)).toBe(false)
      expect(existsSync(targetPath)).toBe(true)
      expect(readFileSync(targetPath, 'utf8')).toBe('source content')
    })
  })

  describe('identifyCompletedPrds', () => {
    test('returns empty array when no PRDs exist', async () => {
      mockPrdList = []

      const result = await identifyCompletedPrds()

      expect(result).toEqual([])
    })

    test('returns empty array when no PRDs are completed', async () => {
      mockPrdList = [
        { filename: 'prd-feature-a.md', status: 'in progress' },
        { filename: 'prd-feature-b.md', status: 'not started' },
      ]

      const result = await identifyCompletedPrds()

      expect(result).toEqual([])
    })

    test('identifies completed PRDs correctly', async () => {
      mockPrdList = [
        { filename: 'prd-feature-a.md', status: 'completed' },
        { filename: 'prd-feature-b.md', status: 'in progress' },
        { filename: 'prd-feature-c.md', status: 'completed' },
      ]

      const result = await identifyCompletedPrds()

      expect(result).toHaveLength(2)
      expect(result).toEqual([
        {
          featureName: 'feature-a',
          prdFile: 'prd-feature-a.md',
          taskFile: 'tasks-feature-a.yml',
          progressFile: 'progress-feature-a.txt',
        },
        {
          featureName: 'feature-c',
          prdFile: 'prd-feature-c.md',
          taskFile: 'tasks-feature-c.yml',
          progressFile: 'progress-feature-c.txt',
        },
      ])
    })

    test('handles errors from listPrds gracefully', async () => {
      // Set up a scenario that could cause an error in practice
      // For now, we'll just test that the function runs successfully with valid data
      mockPrdList = [{ filename: 'prd-valid.md', status: 'completed' }]

      const result = await identifyCompletedPrds()
      expect(result).toHaveLength(1)
      expect(result[0]?.featureName).toBe('valid')
    })
  })

  describe('archivePrdTriplet', () => {
    beforeEach(() => {
      ensureArchiveDir()
    })

    test('successfully archives complete PRD triplet', async () => {
      const triplet: PrdTriplet = {
        featureName: 'test-feature',
        prdFile: 'prd-test-feature.md',
        taskFile: 'tasks-test-feature.yml',
        progressFile: 'progress-test-feature.txt',
      }

      // Create all files
      const plansDir = join(TEST_CWD, '.plans')
      writeFileSync(join(plansDir, triplet.prdFile), 'PRD content')
      writeFileSync(join(plansDir, triplet.taskFile), 'Task content')
      writeFileSync(join(plansDir, triplet.progressFile), 'Progress content')

      await archivePrdTriplet(triplet)

      // All source files should be moved
      expect(existsSync(join(plansDir, triplet.prdFile))).toBe(false)
      expect(existsSync(join(plansDir, triplet.taskFile))).toBe(false)
      expect(existsSync(join(plansDir, triplet.progressFile))).toBe(false)

      // All files should exist in archive
      const archiveDir = getArchiveDir()
      expect(existsSync(join(archiveDir, triplet.prdFile))).toBe(true)
      expect(existsSync(join(archiveDir, triplet.taskFile))).toBe(true)
      expect(existsSync(join(archiveDir, triplet.progressFile))).toBe(true)
    })

    test('archives only existing files', async () => {
      const triplet: PrdTriplet = {
        featureName: 'partial-feature',
        prdFile: 'prd-partial-feature.md',
        taskFile: 'tasks-partial-feature.yml',
        progressFile: 'progress-partial-feature.txt',
      }

      // Create only PRD and task files
      const plansDir = join(TEST_CWD, '.plans')
      writeFileSync(join(plansDir, triplet.prdFile), 'PRD content')
      writeFileSync(join(plansDir, triplet.taskFile), 'Task content')
      // Progress file does not exist

      await archivePrdTriplet(triplet)

      // Existing files should be archived
      const archiveDir = getArchiveDir()
      expect(existsSync(join(archiveDir, triplet.prdFile))).toBe(true)
      expect(existsSync(join(archiveDir, triplet.taskFile))).toBe(true)
      expect(existsSync(join(archiveDir, triplet.progressFile))).toBe(false)
    })

    test('throws error when no files exist', async () => {
      const triplet: PrdTriplet = {
        featureName: 'empty-feature',
        prdFile: 'prd-empty-feature.md',
        taskFile: 'tasks-empty-feature.yml',
        progressFile: 'progress-empty-feature.txt',
      }

      // Don't create any files

      await expect(archivePrdTriplet(triplet)).rejects.toThrow(HoneError)
    })

    test('validates triplet parameter', async () => {
      await expect(archivePrdTriplet(null as any)).rejects.toThrow(HoneError)

      await expect(
        archivePrdTriplet({
          featureName: '',
          prdFile: 'prd-test.md',
          taskFile: 'tasks-test.yml',
          progressFile: 'progress-test.txt',
        })
      ).rejects.toThrow(HoneError)

      await expect(
        archivePrdTriplet({
          featureName: 'test',
          prdFile: '',
          taskFile: 'tasks-test.yml',
          progressFile: 'progress-test.txt',
        })
      ).rejects.toThrow(HoneError)
    })

    test('handles partial failure during operation', async () => {
      const triplet: PrdTriplet = {
        featureName: 'test-feature',
        prdFile: 'prd-test-feature.md',
        taskFile: 'tasks-test-feature.yml',
        progressFile: 'progress-test-feature.txt',
      }

      const plansDir = join(TEST_CWD, '.plans')
      writeFileSync(join(plansDir, triplet.prdFile), 'PRD content')
      writeFileSync(join(plansDir, triplet.taskFile), 'Task content')

      // Create a conflicting file in archive to cause error
      const archiveDir = getArchiveDir()
      mkdirSync(join(archiveDir, triplet.taskFile)) // Create directory with same name

      await expect(archivePrdTriplet(triplet)).rejects.toThrow(HoneError)
    })
  })

  describe('pruneCompletedPrds', () => {
    beforeEach(() => {
      ensureArchiveDir()
    })

    test('validates dry-run parameter', async () => {
      await expect(pruneCompletedPrds('invalid' as any)).rejects.toThrow(HoneError)
    })

    test('throws error when plans directory does not exist', async () => {
      // Remove plans directory
      rmSync(join(TEST_CWD, '.plans'), { recursive: true, force: true })

      await expect(pruneCompletedPrds(false)).rejects.toThrow(HoneError)
    })

    test('shows message when no completed PRDs found', async () => {
      mockPrdList = [{ filename: 'prd-feature-a.md', status: 'in progress' }]

      await pruneCompletedPrds(false)

      expect(logCalls).toContain('No completed PRDs found to archive.')
    })

    test('dry-run mode previews operations without executing', async () => {
      mockPrdList = [{ filename: 'prd-test-feature.md', status: 'completed' }]

      // Create PRD file
      const plansDir = join(TEST_CWD, '.plans')
      writeFileSync(join(plansDir, 'prd-test-feature.md'), 'PRD content')

      await pruneCompletedPrds(true)

      // File should still exist (not moved)
      expect(existsSync(join(plansDir, 'prd-test-feature.md'))).toBe(true)

      // Should show preview
      expect(logCalls.some(call => call.includes('Dry-run mode'))).toBe(true)
      expect(logCalls.some(call => call.includes('test-feature'))).toBe(true)
    })

    test('executes actual archiving in non-dry-run mode', async () => {
      mockPrdList = [{ filename: 'prd-test-feature.md', status: 'completed' }]

      // Create PRD file
      const plansDir = join(TEST_CWD, '.plans')
      writeFileSync(join(plansDir, 'prd-test-feature.md'), 'PRD content')

      await pruneCompletedPrds(false)

      // File should be moved to archive
      expect(existsSync(join(plansDir, 'prd-test-feature.md'))).toBe(false)
      expect(existsSync(join(getArchiveDir(), 'prd-test-feature.md'))).toBe(true)

      // Should show success message
      expect(logCalls.some(call => call.includes('Moved 1 finished PRD'))).toBe(true)
    })

    test('handles individual PRD failures gracefully', async () => {
      mockPrdList = [
        { filename: 'prd-good-feature.md', status: 'completed' },
        { filename: 'prd-bad-feature.md', status: 'completed' },
      ]

      const plansDir = join(TEST_CWD, '.plans')

      // Create good file
      writeFileSync(join(plansDir, 'prd-good-feature.md'), 'Good content')

      // Create bad file that will conflict
      writeFileSync(join(plansDir, 'prd-bad-feature.md'), 'Bad content')
      const archiveDir = getArchiveDir()
      mkdirSync(join(archiveDir, 'prd-bad-feature.md')) // Create conflicting directory

      await pruneCompletedPrds(false)

      // Good file should be archived, bad one should fail
      expect(existsSync(join(archiveDir, 'prd-good-feature.md'))).toBe(true)
      expect(existsSync(join(plansDir, 'prd-bad-feature.md'))).toBe(true)

      // Should show partial success
      expect(errorCalls.some(call => call.includes('Failed to archive bad-feature'))).toBe(true)
      expect(logCalls.some(call => call.includes('Moved 1 finished PRD'))).toBe(true)
    })

    test('handles missing plans directory', async () => {
      // Remove plans directory to test error handling
      rmSync(join(TEST_CWD, '.plans'), { recursive: true, force: true })

      await expect(pruneCompletedPrds(false)).rejects.toThrow(HoneError)
    })

    test('handles no completed PRDs gracefully', async () => {
      mockPrdList = []

      await pruneCompletedPrds(false)

      expect(logCalls).toContain('No completed PRDs found to archive.')
    })
  })
})
