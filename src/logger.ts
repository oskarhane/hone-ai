/**
 * Logging utilities for hone
 * Provides verbose/quiet logging controls
 */

let isVerbose = false

export function setVerbose(verbose: boolean): void {
  isVerbose = verbose
}

export function getVerbose(): boolean {
  return isVerbose
}

/**
 * Log information message only if verbose mode is enabled
 */
export function logVerbose(message: string): void {
  if (isVerbose) {
    console.log(message)
  }
}

/**
 * Log error message only if verbose mode is enabled
 */
export function logVerboseError(message: string): void {
  if (isVerbose) {
    console.error(message)
  }
}

/**
 * Always log - for critical messages regardless of verbose mode
 */
export function log(message: string): void {
  console.log(message)
}

/**
 * Always log error - for critical errors regardless of verbose mode
 */
export function logError(message: string): void {
  console.error(message)
}
