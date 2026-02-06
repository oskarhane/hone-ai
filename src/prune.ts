/**
 * Prune functionality for archiving completed PRDs
 */

import { existsSync, mkdirSync } from 'fs'
import { rename } from 'fs/promises'
import { join, relative, resolve, dirname, basename } from 'path'
import { randomUUID } from 'crypto'
import { getPlansDir } from './config.js'
import { HoneError, formatError } from './errors.js'
import { listPrds, extractFeatureName, type PrdInfo } from './prds.js'

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
 * Move completed PRDs and their associated files to .plans/archive/
 */
export async function pruneCompletedPrds(dryRun: boolean): Promise<void> {
  // TODO: Implement full prune functionality
  if (dryRun) {
    console.log('Dry-run mode: Would preview operations without executing moves')
  } else {
    console.log('Would archive completed PRDs')
  }
}
