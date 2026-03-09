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
 * Helper function to construct model argument for agents.
 * @internal
 */
export function buildModelArg(agent: AgentType, model: string | undefined): string | undefined {
  if (!model) return undefined

  if (agent === 'opencode') {
    // If model already has provider prefix (e.g., openai/gpt-4o), use as-is
    // Otherwise, prepend anthropic/ for backward compatibility (e.g., claude-sonnet-4)
    return model.includes('/') ? model : `anthropic/${model}`
  }

  // Claude agent passes model unchanged
  return model
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
  // opencode: opencode run [--model <provider>/<model>] "prompt text"
  // claude: claude -p [--model <model>] "prompt text"
  const command = agent === 'opencode' ? 'opencode' : 'claude'
  const args: string[] = []
  const modelArg = buildModelArg(agent, model)

  if (agent === 'opencode') {
    args.push('run')
    if (modelArg) {
      args.push('--model', modelArg)
    }
    args.push(prompt)
  } else {
    args.push('-p')
    args.push('--output-format', 'stream-json')
    args.push('--verbose')
    if (modelArg) {
      args.push('--model', modelArg)
    }
    args.push(prompt)
  }

  // Log command being executed (replace the prompt value with "<prompt>" for readability)
  const displayArgs = args.map((a, i) => {
    // For both agents: prompt is last arg
    if (i === args.length - 1) {
      return '"<prompt>"'
    }
    return a
  })
  const cmdString = `${command} ${displayArgs.join(' ')}`
  logVerbose(`[Agent] Command: ${cmdString}`)
  logVerbose(`[Agent] Prompt length: ${prompt.length} characters`)
  logVerbose(`[Agent] Prompt preview: ${prompt.substring(0, 200)}...`)

  return new Promise((resolve, reject) => {
    logVerbose(`[Agent] Args: ${JSON.stringify(args.slice(0, -1))} + <prompt>`)

    const child: ChildProcess = spawn(command, args, {
      cwd: workingDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let isKilled = false
    let timeoutId: NodeJS.Timeout | undefined

    // Stream stdout to console and capture
    if (child.stdout) {
      let buffer = ''
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        logVerbose(`[Agent] stdout data: ${text.length} bytes`)

        // For claude with stream-json, parse and extract content
        if (agent === 'claude') {
          buffer += text
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const json = JSON.parse(line)
              // Extract content from stream-json format
              if (json.type === 'assistant' && json.message?.content) {
                for (const block of json.message.content) {
                  if (block.type === 'text' && block.text) {
                    // Add spacing after punctuation when followed by capital letter for readability
                    let content = block.text
                    content = content.replace(/([.!?:])([A-Z])/g, '$1 $2')
                    if (!silent) {
                      process.stdout.write(content)
                    }
                    stdout += content
                  }
                }
              } else if (json.type === 'result') {
                // Final result message
                logVerbose(`[Agent] Stream complete: ${json.subtype}`)
              } else if (json.type === 'system') {
                // Initial system message
                logVerbose(`[Agent] Stream initialized`)
              }
            } catch (e) {
              logVerboseError(`[Agent] Failed to parse stream JSON: ${line}`)
            }
          }
        } else {
          // For opencode, output text directly
          if (!silent) {
            process.stdout.write(text)
          }
          stdout += text
        }
      })
    } else {
      logVerboseError('[Agent] No stdout stream available')
    }

    // Stream stderr to console and capture
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        logVerbose(`[Agent] stderr data: ${text.length} bytes`)
        if (!silent) {
          process.stderr.write(text)
        }
        stderr += text
      })
    } else {
      logVerboseError('[Agent] No stderr stream available')
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

    // Handle SIGINT (ctrl+c) and SIGTERM to kill child process and exit
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
        // Exit the parent process so the run loop doesn't continue
        process.exit(130)
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
    const child = spawn('which', [command], {
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
