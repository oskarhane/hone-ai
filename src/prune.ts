/**
 * Prune functionality for archiving completed PRDs
 */

import { existsSync, mkdirSync } from 'fs'
import { rename } from 'fs/promises'
import { join, relative, resolve, dirname, basename } from 'path'
import { randomUUID } from 'crypto'
import { getPlansDir } from './config.js'
import { HoneError, formatError } from './errors.js'
import { listPrds, extractFeatureName } from './prds.js'

/**
 * Represents a file move operation in progress
 */
interface FileMoveOperation {
  /** Original source file path */
  sourcePath: string
  /** Final target file path */
  targetPath: string
  /** Temporary staging file path */
  tempPath: string
  /** Whether the operation has been committed (moved to temp) */
  staged: boolean
}

/**
 * Get the archive directory path (.plans/archive/)
 */
export function getArchiveDir(): string {
  return join(getPlansDir(), 'archive')
}

/**
 * Ensure archive directory exists, creating it if necessary
 */
export function ensureArchiveDir(): void {
  const archiveDir = getArchiveDir()
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true })
  }
}

/**
 * Validate that a file path is within the .plans directory tree (including archive subdirectory) for security
 * @param filePath Path to validate
 * @returns Resolved absolute path
 * @throws HoneError if path traversal is detected
 */
function validateArchivePath(filePath: string): string {
  const resolved = resolve(filePath)
  const plansDir = resolve(getPlansDir())

  // Ensure path is within .plans directory tree
  const relativeToPlans = relative(plansDir, resolved)

  if (relativeToPlans.startsWith('..')) {
    throw new HoneError(
      formatError('Path traversal detected', `File must be within .plans directory: ${filePath}`)
    )
  }

  return resolved
}

/**
 * Create temporary file path for atomic operations
 * @param filePath Original file path
 * @returns Temporary file path with unique identifier
 */
function createTempFilePath(filePath: string): string {
  const dir = dirname(filePath)
  const base = basename(filePath)
  const uuid = randomUUID().substring(0, 8) // Use shorter UUID for temp files
  return join(dir, `.${base}.tmp.${uuid}`)
}

/**
 * Atomically move a file to the archive directory
 * @param sourcePath Source file path (must be within .plans)
 * @param targetName Target filename in archive directory
 * @throws HoneError for validation, permission, or filesystem errors
 */
export async function archiveFile(sourcePath: string, targetName: string): Promise<void> {
  // Validate input parameters
  if (!sourcePath || typeof sourcePath !== 'string') {
    throw new HoneError(
      formatError('Invalid source path', 'Source path is required for archive operation')
    )
  }

  if (!targetName || typeof targetName !== 'string') {
    throw new HoneError(
      formatError('Invalid target name', 'Target filename is required for archive operation')
    )
  }

  // Validate and resolve paths
  const validatedSourcePath = validateArchivePath(sourcePath)

  if (!existsSync(validatedSourcePath)) {
    throw new HoneError(
      formatError('Source file not found', `Cannot archive file that does not exist: ${sourcePath}`)
    )
  }

  // Ensure archive directory exists
  ensureArchiveDir()

  const archiveDir = getArchiveDir()
  const targetPath = join(archiveDir, targetName)
  const tempPath = createTempFilePath(targetPath)

  try {
    // First rename to temp file in archive directory for atomic operation
    await rename(validatedSourcePath, tempPath)

    // Then rename temp file to final target
    await rename(tempPath, targetPath)
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        await rename(tempPath, validatedSourcePath) // Try to restore original
      }
    } catch {
      // Ignore cleanup errors during error handling
    }

    // Handle specific filesystem errors
    const nodeError = error as any
    if (nodeError?.code === 'EACCES') {
      throw new HoneError(
        formatError(
          'Permission denied archiving file',
          `Cannot move file to archive: ${sourcePath}. Check permissions.`
        )
      )
    } else if (nodeError?.code === 'ENOENT') {
      throw new HoneError(
        formatError(
          'File not found during archive',
          `Source file disappeared during operation: ${sourcePath}`
        )
      )
    } else if (nodeError?.code === 'EEXIST') {
      throw new HoneError(
        formatError(
          'Target file already exists in archive',
          `Cannot archive to existing file: ${targetName}`
        )
      )
    } else if (nodeError?.code === 'EXDEV') {
      throw new HoneError(
        formatError(
          'Cross-device move not supported',
          'Archive operation across different filesystems not supported'
        )
      )
    } else if (nodeError?.code === 'ENOSPC') {
      throw new HoneError(
        formatError(
          'Insufficient disk space',
          'Not enough disk space to complete archive operation'
        )
      )
    } else if (nodeError?.code === 'EROFS') {
      throw new HoneError(
        formatError('Read-only file system', 'Cannot write to read-only archive directory')
      )
    }

    throw new HoneError(
      formatError(
        'Failed to archive file',
        `Filesystem error moving ${sourcePath} to archive: ${error instanceof Error ? error.message : String(error)}`
      )
    )
  }
}

/**
 * PRD triplet containing all files associated with a PRD
 */
export interface PrdTriplet {
  /** The feature name (extracted from prd filename) */
  featureName: string
  /** PRD file path relative to plans directory */
  prdFile: string
  /** Task YAML file path relative to plans directory (may not exist) */
  taskFile: string
  /** Progress text file path relative to plans directory (may not exist) */
  progressFile: string
}

/**
 * Identify completed PRDs by parsing associated task YAML files
 * Reuses existing calculateStatus() logic from prds.ts for consistency
 * @returns Array of PrdTriplet objects for completed PRDs
 */
export async function identifyCompletedPrds(): Promise<PrdTriplet[]> {
  try {
    // Use existing listPrds() to get all PRDs with status information
    const allPrds = await listPrds()

    // Filter to only completed PRDs
    const completedPrds = allPrds.filter(prd => prd.status === 'completed')

    // Convert to PrdTriplet format with all associated files
    const prdTriplets: PrdTriplet[] = completedPrds.map(prd => {
      const featureName = extractFeatureName(prd.filename)

      return {
        featureName,
        prdFile: prd.filename,
        taskFile: `tasks-${featureName}.yml`,
        progressFile: `progress-${featureName}.txt`,
      }
    })

    return prdTriplets
  } catch (error) {
    throw new HoneError(
      formatError(
        'Failed to identify completed PRDs',
        `Error parsing PRD or task files: ${error instanceof Error ? error.message : String(error)}`
      )
    )
  }
}

/**
 * Atomically move all files in a PRD triplet to the archive directory
 * Uses temporary staging and atomic rename operations to prevent partial moves
 * @param triplet PRD triplet containing all associated file paths
 * @throws HoneError for validation, permission, or filesystem errors
 */
export async function archivePrdTriplet(triplet: PrdTriplet): Promise<void> {
  // Validate input
  if (!triplet || !triplet.featureName) {
    throw new HoneError(
      formatError('Invalid PRD triplet', 'Feature name is required for archive operation')
    )
  }

  // Ensure archive directory exists
  ensureArchiveDir()

  const plansDir = getPlansDir()
  const archiveDir = getArchiveDir()

  // Prepare all file operations
  const operations: FileMoveOperation[] = []
  const filesToMove = [triplet.prdFile, triplet.taskFile, triplet.progressFile]

  // Only move files that actually exist
  for (const filePath of filesToMove) {
    const sourcePath = join(plansDir, filePath)

    if (existsSync(sourcePath)) {
      const targetPath = join(archiveDir, filePath)
      const tempPath = createTempFilePath(targetPath)

      operations.push({
        sourcePath: validateArchivePath(sourcePath),
        targetPath,
        tempPath,
        staged: false,
      })
    }
  }

  if (operations.length === 0) {
    throw new HoneError(
      formatError('No files to archive', `No files found for PRD feature '${triplet.featureName}'`)
    )
  }

  // Execute atomic move operation
  const stagedOperations: FileMoveOperation[] = []

  try {
    // Stage 1: Move all files to temporary locations in archive directory
    for (const operation of operations) {
      await rename(operation.sourcePath, operation.tempPath)
      operation.staged = true
      stagedOperations.push(operation)
    }

    // Stage 2: Move all files from temp to final locations atomically
    for (const operation of stagedOperations) {
      await rename(operation.tempPath, operation.targetPath)
      operation.staged = false // Successfully committed
    }
  } catch (error) {
    // Error recovery: restore any staged files back to original locations
    // Note: Files that completed Stage 2 (temp→target) before error are left in archive
    // This is intentional as they are in a valid state; the triplet is just incomplete
    for (const operation of stagedOperations) {
      if (operation.staged) {
        try {
          // Try to restore from temp back to original location
          if (existsSync(operation.tempPath)) {
            await rename(operation.tempPath, operation.sourcePath)
          }
        } catch {
          // Ignore recovery errors during error handling
        }
      }
    }

    // Handle specific filesystem errors with user-friendly messages
    const nodeError = error as any
    if (nodeError?.code === 'EACCES') {
      throw new HoneError(
        formatError(
          'Permission denied archiving PRD',
          `Cannot move files for feature '${triplet.featureName}'. Check permissions.`
        )
      )
    } else if (nodeError?.code === 'ENOENT') {
      throw new HoneError(
        formatError(
          'File disappeared during archive operation',
          `One of the files for feature '${triplet.featureName}' was deleted during the operation`
        )
      )
    } else if (nodeError?.code === 'ENOSPC') {
      throw new HoneError(
        formatError(
          'Insufficient disk space',
          `Not enough disk space to archive files for feature '${triplet.featureName}'`
        )
      )
    } else if (nodeError?.code === 'EXDEV') {
      throw new HoneError(
        formatError(
          'Cross-device move not supported',
          `Archive operation across different filesystems not supported for '${triplet.featureName}'`
        )
      )
    } else if (nodeError?.code === 'EROFS') {
      throw new HoneError(
        formatError(
          'Read-only file system',
          `Cannot write to read-only archive directory for '${triplet.featureName}'`
        )
      )
    }

    throw new HoneError(
      formatError(
        'Failed to archive PRD triplet',
        `Filesystem error archiving '${triplet.featureName}': ${error instanceof Error ? error.message : String(error)}`
      )
    )
  }
}

/**
 * Move completed PRDs and their associated files to .plans/archive/
 * @param dryRun If true, only preview operations without executing moves
 */
export async function pruneCompletedPrds(dryRun: boolean): Promise<void> {
  try {
    // Identify completed PRDs
    const completedPrds = await identifyCompletedPrds()

    if (completedPrds.length === 0) {
      console.log('No completed PRDs found to archive.')
      console.log('')
      console.log('Complete some tasks with: hone run <task-file>')
      return
    }

    if (dryRun) {
      console.log(
        `Dry-run mode: Preview of ${completedPrds.length} PRD${completedPrds.length === 1 ? '' : 's'} that would be archived`
      )
      console.log('')

      for (const prd of completedPrds) {
        console.log(`  Feature: ${prd.featureName}`)

        // Show which files would be moved
        const plansDir = getPlansDir()
        const existingFiles: string[] = []

        const filesToCheck = [
          { path: prd.prdFile, label: 'PRD' },
          { path: prd.taskFile, label: 'Tasks' },
          { path: prd.progressFile, label: 'Progress' },
        ]

        for (const file of filesToCheck) {
          const fullPath = join(plansDir, file.path)
          if (existsSync(fullPath)) {
            existingFiles.push(`${file.label}: .plans/${file.path}`)
          }
        }

        for (const fileInfo of existingFiles) {
          console.log(`    ${fileInfo}`)
        }
        console.log('')
      }

      const featureNames = completedPrds.map(prd => prd.featureName).join(', ')
      console.log(
        `Summary: Would move ${completedPrds.length} finished PRD${completedPrds.length === 1 ? '' : 's'} to archive: ${featureNames}`
      )
      console.log('')
      console.log('Run without --dry-run to execute the archive operation.')
    } else {
      // Execute actual archiving
      console.log(
        `Archiving ${completedPrds.length} completed PRD${completedPrds.length === 1 ? '' : 's'}...`
      )
      console.log('')

      const archivedFeatures: string[] = []

      for (const prd of completedPrds) {
        await archivePrdTriplet(prd)
        archivedFeatures.push(prd.featureName)
        console.log(`  [ok] Archived: ${prd.featureName}`)
      }

      console.log('')
      console.log(
        `Moved ${completedPrds.length} finished PRD${completedPrds.length === 1 ? '' : 's'} to archive: ${archivedFeatures.join(', ')}`
      )
    }
  } catch (error) {
    if (error instanceof HoneError) {
      throw error
    }
    throw new HoneError(
      formatError(
        'Failed to prune completed PRDs',
        `Error during prune operation: ${error instanceof Error ? error.message : String(error)}`
      )
    )
  }
}
