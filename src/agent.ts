import { spawn, type ChildProcess } from 'child_process'
import type { AgentType } from './config'
import { exitWithError, ErrorMessages } from './errors'
import { logVerbose, logVerboseError } from './logger'

export interface SpawnAgentOptions {
  agent: AgentType
  prompt: string
  workingDir?: string
  model?: string
  silent?: boolean
  timeout?: number // Timeout in milliseconds
}

export interface SpawnAgentResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Spawn an agent subprocess (opencode or claude) and stream output in real-time.
 * @param options - Configuration for spawning the agent
 * @returns Promise resolving to exit code and captured output
 */
export async function spawnAgent(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  const { agent, prompt, workingDir = process.cwd(), model, silent = false, timeout } = options

  // Log agent spawn initiation
  logVerbose(`[Agent] Spawning ${agent} agent${model ? ` with model ${model}` : ''}`)
  logVerbose(`[Agent] Working directory: ${workingDir}`)

  // Build command and args based on agent type
  // opencode: opencode run [--model anthropic/<model>] "prompt text"
  // claude: claude -p "prompt text" [--model <model>]
  const command = agent === 'opencode' ? 'opencode' : 'claude'
  const args: string[] = []

  if (agent === 'opencode') {
    args.push('run')
    if (model) {
      args.push('--model', `anthropic/${model}`)
    }
    args.push(prompt)
  } else {
    args.push('-p', prompt)
    if (model) {
      args.push('--model', model)
    }
  }

  // Log command being executed
  const cmdString = `${command} ${args.slice(0, -1).join(' ')} "<prompt>"`
  logVerbose(`[Agent] Command: ${cmdString}`)

  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      cwd: workingDir,
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let isKilled = false
    let timeoutId: NodeJS.Timeout | undefined

    // Stream stdout to console and capture
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        if (!silent) {
          process.stdout.write(text)
        }
        stdout += text
      })
    }

    // Stream stderr to console and capture
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        if (!silent) {
          process.stderr.write(text)
        }
        stderr += text
      })
    }

    // Set up timeout if specified
    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => {
        if (!isKilled && child.pid) {
          logVerboseError(`[Agent] Process timed out after ${timeout}ms, killing...`)
          isKilled = true
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch (err) {
            child.kill('SIGTERM')
          }
        }
      }, timeout)
    }

    // Handle SIGINT (ctrl+c) and SIGTERM to kill child process
    const handleSignal = (signal: NodeJS.Signals) => {
      if (!isKilled && child.pid) {
        isKilled = true
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }
        // Kill the child process group
        try {
          process.kill(-child.pid, signal)
        } catch (err) {
          // Fallback to killing just the child
          child.kill(signal)
        }
      }
    }

    process.on('SIGINT', handleSignal)
    process.on('SIGTERM', handleSignal)

    // Handle process exit
    child.on('close', (code: number | null) => {
      // Clean up signal handlers and timeout
      process.off('SIGINT', handleSignal)
      process.off('SIGTERM', handleSignal)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }

      const exitCode = code ?? 1

      // Check if process was killed due to timeout
      if (isKilled && timeout) {
        logVerboseError(`[Agent] Process was terminated due to timeout (${timeout}ms)`)
        resolve({
          exitCode: 124, // Standard timeout exit code
          stdout,
          stderr: stderr + '\nProcess timed out',
        })
        return
      }

      // Log completion status
      if (exitCode === 0) {
        logVerbose(`[Agent] Process completed successfully (exit code 0)`)
      } else {
        logVerboseError(`[Agent] Process exited with code ${exitCode}`)
      }

      resolve({
        exitCode,
        stdout,
        stderr,
      })
    })

    // Handle spawn errors (e.g., command not found)
    child.on('error', (error: Error) => {
      // Clean up signal handlers and timeout
      process.off('SIGINT', handleSignal)
      process.off('SIGTERM', handleSignal)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }

      logVerboseError(`[Agent] Spawn error: ${error.message}`)
      reject(new Error(`Failed to spawn ${agent}: ${error.message}`))
    })
  })
}

/**
 * Check if an agent command is available in the system PATH.
 * @param agent - Agent type to check
 * @returns Promise resolving to true if agent is available
 */
export async function isAgentAvailable(agent: AgentType): Promise<boolean> {
  const command = agent === 'opencode' ? 'opencode' : 'claude'

  return new Promise(resolve => {
    const child = spawn(command === 'opencode' ? 'which' : 'which', [command], {
      stdio: 'ignore',
    })

    child.on('close', (code: number | null) => {
      resolve(code === 0)
    })

    child.on('error', () => {
      resolve(false)
    })
  })
}
