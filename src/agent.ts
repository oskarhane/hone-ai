import { spawn, type ChildProcess } from 'child_process';
import type { AgentType } from './config';
import { exitWithError, ErrorMessages } from './errors';

export interface SpawnAgentOptions {
  agent: AgentType;
  prompt: string;
  workingDir?: string;
  model?: string;
}

export interface SpawnAgentResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn an agent subprocess (opencode or claude) and stream output in real-time.
 * @param options - Configuration for spawning the agent
 * @returns Promise resolving to exit code and captured output
 */
export async function spawnAgent(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  const { agent, prompt, workingDir = process.cwd(), model } = options;
  
  // Log agent spawn initiation
  console.log(`[Agent] Spawning ${agent} agent${model ? ` with model ${model}` : ''}`);
  console.log(`[Agent] Working directory: ${workingDir}`);
  
  // Build command and args based on agent type
  // opencode: opencode run [--model anthropic/<model>] "prompt text"
  // claude: claude -p "prompt text" [--model <model>]
  const command = agent === 'opencode' ? 'opencode' : 'claude';
  const args: string[] = [];
  
  if (agent === 'opencode') {
    args.push('run');
    if (model) {
      args.push('--model', `anthropic/${model}`);
    }
    args.push(prompt);
  } else {
    args.push('-p', prompt);
    if (model) {
      args.push('--model', model);
    }
  }
  
  // Log command being executed
  const cmdString = `${command} ${args.slice(0, -1).join(' ')} "<prompt>"`;
  console.log(`[Agent] Command: ${cmdString}`);
  
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      cwd: workingDir,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    let isKilled = false;
    
    // Stream stdout to console and capture
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        process.stdout.write(text);
        stdout += text;
      });
    }
    
    // Stream stderr to console and capture
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        process.stderr.write(text);
        stderr += text;
      });
    }
    
    // Handle SIGINT (ctrl+c) and SIGTERM to kill child process
    const handleSignal = (signal: NodeJS.Signals) => {
      if (!isKilled && child.pid) {
        isKilled = true;
        // Kill the child process group
        try {
          process.kill(-child.pid, signal);
        } catch (err) {
          // Fallback to killing just the child
          child.kill(signal);
        }
      }
    };
    
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);
    
    // Handle process exit
    child.on('close', (code: number | null) => {
      // Clean up signal handlers
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      
      const exitCode = code ?? 1;
      
      // Log completion status
      if (exitCode === 0) {
        console.log(`[Agent] Process completed successfully (exit code 0)`);
      } else {
        console.error(`[Agent] Process exited with code ${exitCode}`);
      }
      
      resolve({
        exitCode,
        stdout,
        stderr
      });
    });
    
    // Handle spawn errors (e.g., command not found)
    child.on('error', (error: Error) => {
      // Clean up signal handlers
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      
      console.error(`[Agent] Spawn error: ${error.message}`);
      reject(new Error(`Failed to spawn ${agent}: ${error.message}`));
    });
  });
}

/**
 * Check if an agent command is available in the system PATH.
 * @param agent - Agent type to check
 * @returns Promise resolving to true if agent is available
 */
export async function isAgentAvailable(agent: AgentType): Promise<boolean> {
  const command = agent === 'opencode' ? 'opencode' : 'claude';
  
  return new Promise((resolve) => {
    const child = spawn(command === 'opencode' ? 'which' : 'which', [command], {
      stdio: 'ignore'
    });
    
    child.on('close', (code: number | null) => {
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
  });
}
