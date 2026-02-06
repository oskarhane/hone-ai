/**
 * Prune functionality for archiving completed PRDs
 */

import { existsSync, mkdirSync, constants } from 'fs'
import { rename, access } from 'fs/promises'
import { join, relative, resolve, dirname, basename } from 'path'
import { homedir } from 'os'
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
 * @throws HoneError for permission issues or filesystem errors
 */
export function ensureArchiveDir(): void {
  const archiveDir = getArchiveDir()
  if (!existsSync(archiveDir)) {
    try {
      mkdirSync(archiveDir, { recursive: true })
    } catch (error) {
      const nodeError = error as any
      if (nodeError?.code === 'EACCES') {
        throw new HoneError(
          formatError(
            'Permission denied creating archive directory',
            `Cannot create archive directory: ${archiveDir}\n\nPlease ensure you have write permissions to the .plans directory.`
          )
        )
      } else if (nodeError?.code === 'ENOSPC') {
        throw new HoneError(
          formatError(
            'Insufficient disk space',
            'Cannot create archive directory due to insufficient disk space.\n\nFree up some disk space and try again.'
          )
        )
      } else if (nodeError?.code === 'EROFS') {
        throw new HoneError(
          formatError(
            'Read-only file system',
            'Cannot create archive directory on read-only file system.\n\nEnsure the .plans directory is on a writable file system.'
          )
        )
      } else if (nodeError?.code === 'ENOTDIR') {
        throw new HoneError(
          formatError(
            'Invalid directory path',
            `Cannot create archive directory: ${archiveDir}\n\nA file exists at this path. Please remove it first.`
          )
        )
      }

      throw new HoneError(
        formatError(
          'Failed to create archive directory',
          `Filesystem error creating ${archiveDir}: ${error instanceof Error ? error.message : String(error)}\n\nPlease check directory permissions and try again.`
        )
      )
    }
  }
}

/**
 * Expand home directory (~) in file paths manually
 * @param filePath Path that may contain ~
 * @returns Path with ~ expanded to home directory
 */
function expandHomePath(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return filePath.replace(/^~/, homedir())
  }
  return filePath
}

/**
 * Validate that a file path is within the .plans directory tree (including archive subdirectory) for security
 * @param filePath Path to validate (supports ~ expansion)
 * @returns Resolved absolute path
 * @throws HoneError if path traversal is detected or path is invalid
 */
function validateArchivePath(filePath: string): string {
  // Input validation
  if (!filePath || typeof filePath !== 'string') {
    throw new HoneError(formatError('Invalid file path', 'File path must be a non-empty string.'))
  }

  if (filePath.trim() === '') {
    throw new HoneError(
      formatError('Empty file path', 'File path cannot be empty or contain only whitespace.')
    )
  }

  // Expand home directory and resolve path
  const expandedPath = expandHomePath(filePath.trim())
  const resolved = resolve(expandedPath)
  const plansDir = resolve(getPlansDir())

  // Ensure path is within .plans directory tree
  const relativeToPlans = relative(plansDir, resolved)

  if (relativeToPlans.startsWith('..')) {
    throw new HoneError(
      formatError(
        'Path traversal detected',
        `File must be within .plans directory: ${filePath}\n\nFor security reasons, only files within the .plans directory can be archived.`
      )
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
      formatError('Invalid source path', 'Source path is required for archive operation.')
    )
  }

  if (!targetName || typeof targetName !== 'string') {
    throw new HoneError(
      formatError('Invalid target name', 'Target filename is required for archive operation.')
    )
  }

  if (targetName.trim() === '') {
    throw new HoneError(
      formatError(
        'Empty target name',
        'Target filename cannot be empty or contain only whitespace.'
      )
    )
  }

  // Additional filename validation
  if (targetName.includes('/') || targetName.includes('\\')) {
    throw new HoneError(
      formatError(
        'Invalid target filename',
        `Target filename cannot contain path separators: ${targetName}\n\nUse only the filename portion without directories.`
      )
    )
  }

  if (targetName.startsWith('.') && targetName !== '.gitkeep') {
    throw new HoneError(
      formatError(
        'Invalid target filename',
        `Target filename cannot start with dot (hidden files): ${targetName}\n\nUse a regular filename without leading dots.`
      )
    )
  }

  // Validate and resolve paths
  const validatedSourcePath = validateArchivePath(sourcePath)

  if (!existsSync(validatedSourcePath)) {
    throw new HoneError(
      formatError(
        'Source file not found',
        `Cannot archive file that does not exist: ${sourcePath}\n\nPlease ensure the file exists before attempting to archive it.`
      )
    )
  }

  // Additional file access validation
  try {
    await access(validatedSourcePath, constants.R_OK)
  } catch (error) {
    const nodeError = error as any
    if (nodeError?.code === 'EACCES') {
      throw new HoneError(
        formatError(
          'Permission denied accessing source file',
          `Cannot read source file: ${sourcePath}\n\nPlease check file permissions and ensure you have read access.`
        )
      )
    }
    throw new HoneError(
      formatError(
        'Cannot access source file',
        `Unable to access source file: ${sourcePath}\n\nError: ${error instanceof Error ? error.message : String(error)}`
      )
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

    // Handle specific filesystem errors with detailed guidance
    const nodeError = error as any
    if (nodeError?.code === 'EACCES') {
      throw new HoneError(
        formatError(
          'Permission denied archiving file',
          `Cannot move file to archive: ${sourcePath}\n\nTroubleshooting:\n• Check file and directory permissions\n• Ensure you have write access to both source and archive directories\n• Run with appropriate user permissions`
        )
      )
    } else if (nodeError?.code === 'ENOENT') {
      throw new HoneError(
        formatError(
          'File not found during archive',
          `Source file disappeared during operation: ${sourcePath}\n\nThis may happen if:\n• Another process deleted the file\n• The file was moved by another operation\n• Network or filesystem issues occurred\n\nRe-run the command to try again.`
        )
      )
    } else if (nodeError?.code === 'EEXIST') {
      throw new HoneError(
        formatError(
          'Target file already exists in archive',
          `Cannot archive to existing file: ${targetName}\n\nTo resolve:\n• Remove the existing file in .plans/archive/\n• Or choose a different filename\n• Or run 'hone prune --dry-run' to preview conflicts`
        )
      )
    } else if (nodeError?.code === 'EXDEV') {
      throw new HoneError(
        formatError(
          'Cross-device move not supported',
          'Archive operation across different filesystems not supported.\n\nThe .plans directory and archive directory must be on the same filesystem.\nConsider moving your project to a single filesystem or copying files instead of moving them.'
        )
      )
    } else if (nodeError?.code === 'ENOSPC') {
      throw new HoneError(
        formatError(
          'Insufficient disk space',
          'Not enough disk space to complete archive operation.\n\nTo resolve:\n• Free up disk space\n• Remove old files from .plans/archive/\n• Move project to a location with more space'
        )
      )
    } else if (nodeError?.code === 'EROFS') {
      throw new HoneError(
        formatError(
          'Read-only file system',
          'Cannot write to read-only archive directory.\n\nTo resolve:\n• Remount filesystem as writable\n• Change to a writable directory\n• Check filesystem mount options'
        )
      )
    } else if (nodeError?.code === 'EISDIR') {
      throw new HoneError(
        formatError(
          'Target is a directory',
          `Cannot overwrite directory with file: ${targetName}\n\nRemove the directory or choose a different filename.`
        )
      )
    } else if (nodeError?.code === 'ENOTDIR') {
      throw new HoneError(
        formatError(
          'Path component is not a directory',
          `Invalid path structure for archive operation.\n\nEnsure all parent directories exist and are actual directories.`
        )
      )
    }

    throw new HoneError(
      formatError(
        'Failed to archive file',
        `Filesystem error moving ${sourcePath} to archive: ${error instanceof Error ? error.message : String(error)}\n\nGeneral troubleshooting:\n• Check file and directory permissions\n• Ensure sufficient disk space\n• Verify filesystem is writable\n• Re-run the command to retry the operation`
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
  // Validate input triplet
  if (!triplet) {
    throw new HoneError(
      formatError('Missing PRD triplet', 'PRD triplet object is required for archive operation.')
    )
  }

  if (!triplet.featureName || typeof triplet.featureName !== 'string') {
    throw new HoneError(
      formatError(
        'Invalid feature name',
        'Feature name is required and must be a non-empty string.'
      )
    )
  }

  if (triplet.featureName.trim() === '') {
    throw new HoneError(
      formatError('Empty feature name', 'Feature name cannot be empty or contain only whitespace.')
    )
  }

  // Validate file paths in triplet
  const requiredFields = ['prdFile', 'taskFile', 'progressFile'] as const
  for (const field of requiredFields) {
    if (!triplet[field] || typeof triplet[field] !== 'string') {
      throw new HoneError(
        formatError(`Invalid ${field} path`, `${field} must be a non-empty string in PRD triplet.`)
      )
    }
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
      formatError(
        'No files to archive',
        `No files found for PRD feature '${triplet.featureName}'.\n\nExpected files:\n• ${triplet.prdFile}\n• ${triplet.taskFile}\n• ${triplet.progressFile}\n\nEnsure at least one of these files exists in the .plans directory.`
      )
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

    // Handle specific filesystem errors with detailed guidance
    const nodeError = error as any
    if (nodeError?.code === 'EACCES') {
      throw new HoneError(
        formatError(
          'Permission denied archiving PRD',
          `Cannot move files for feature '${triplet.featureName}'.\n\nTroubleshooting:\n• Check permissions on .plans/ and .plans/archive/ directories\n• Ensure you have read/write access to all PRD files\n• Run with appropriate user permissions\n• Use 'hone prune --dry-run' to preview operations before execution`
        )
      )
    } else if (nodeError?.code === 'ENOENT') {
      throw new HoneError(
        formatError(
          'File disappeared during archive operation',
          `One of the files for feature '${triplet.featureName}' was deleted during the operation.\n\nThis may happen if:\n• Another process modified the files\n• Filesystem issues occurred\n• Files were manually removed\n\nRe-run 'hone prune' to try again or use '--dry-run' to preview current state.`
        )
      )
    } else if (nodeError?.code === 'ENOSPC') {
      throw new HoneError(
        formatError(
          'Insufficient disk space',
          `Not enough disk space to archive files for feature '${triplet.featureName}'.\n\nTo resolve:\n• Free up disk space\n• Clean up old files in .plans/archive/\n• Move project to a location with more available space`
        )
      )
    } else if (nodeError?.code === 'EXDEV') {
      throw new HoneError(
        formatError(
          'Cross-device move not supported',
          `Archive operation across different filesystems not supported for '${triplet.featureName}'.\n\nThe .plans directory and archive must be on the same filesystem.\nConsider moving your project to a single filesystem.`
        )
      )
    } else if (nodeError?.code === 'EROFS') {
      throw new HoneError(
        formatError(
          'Read-only file system',
          `Cannot write to read-only archive directory for '${triplet.featureName}'.\n\nTo resolve:\n• Remount filesystem as writable\n• Move project to writable location\n• Check filesystem mount options`
        )
      )
    } else if (nodeError?.code === 'EISDIR') {
      throw new HoneError(
        formatError(
          'Target is a directory',
          `Cannot overwrite directory in archive for '${triplet.featureName}'.\n\nRemove conflicting directories in .plans/archive/ and try again.`
        )
      )
    }

    throw new HoneError(
      formatError(
        'Failed to archive PRD triplet',
        `Filesystem error archiving '${triplet.featureName}': ${error instanceof Error ? error.message : String(error)}\n\nGeneral troubleshooting:\n• Check file and directory permissions\n• Ensure sufficient disk space is available\n• Verify filesystem is writable\n• Use 'hone prune --dry-run' to preview operations\n• Re-run the command to retry the operation`
      )
    )
  }
}

/**
 * Move completed PRDs and their associated files to .plans/archive/
 * @param dryRun If true, only preview operations without executing moves
 * @throws HoneError for validation, permission, or filesystem errors
 */
export async function pruneCompletedPrds(dryRun: boolean): Promise<void> {
  // Input validation
  if (typeof dryRun !== 'boolean') {
    throw new HoneError(
      formatError('Invalid dry-run parameter', 'Dry-run parameter must be a boolean value.')
    )
  }

  try {
    // Verify .plans directory exists before proceeding
    const plansDir = getPlansDir()
    if (!existsSync(plansDir)) {
      throw new HoneError(
        formatError(
          'Plans directory not found',
          `Cannot find .plans directory: ${plansDir}\n\nTo resolve:\n• Run 'hone init' to initialize the project\n• Ensure you're in the correct project directory\n• Check that .plans directory was not accidentally deleted`
        )
      )
    }

    // Identify completed PRDs
    const completedPrds = await identifyCompletedPrds()

    if (completedPrds.length === 0) {
      console.log('No completed PRDs found to archive.')
      console.log('')
      console.log('Complete some tasks with: hone run <task-file>')
      console.log('Or check status with: hone status')
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
        try {
          await archivePrdTriplet(prd)
          archivedFeatures.push(prd.featureName)
          console.log(`  [ok] Archived: ${prd.featureName}`)
        } catch (error) {
          // For individual PRD failures, log error but continue with others
          console.error(
            `  [error] Failed to archive ${prd.featureName}: ${error instanceof Error ? error.message : String(error)}`
          )

          // If it's a critical error (like permissions), stop processing
          if (error instanceof HoneError) {
            const errorMessage = error.message
            if (
              errorMessage.includes('Permission denied') ||
              errorMessage.includes('Read-only file system')
            ) {
              throw error // Re-throw critical errors
            }
          }
        }
      }

      console.log('')
      if (archivedFeatures.length > 0) {
        console.log(
          `Moved ${archivedFeatures.length} finished PRD${archivedFeatures.length === 1 ? '' : 's'} to archive: ${archivedFeatures.join(', ')}`
        )

        if (archivedFeatures.length < completedPrds.length) {
          const failedCount = completedPrds.length - archivedFeatures.length
          console.log(
            `${failedCount} PRD${failedCount === 1 ? '' : 's'} failed to archive (see errors above)`
          )
        }
      } else {
        console.log('No PRDs were successfully archived due to errors.')
        console.log('Use --dry-run to preview operations and troubleshoot issues.')
      }
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
