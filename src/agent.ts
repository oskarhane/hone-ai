import { spawn, type ChildProcess } from 'child_process';
import type { AgentType } from './config';

export interface SpawnAgentOptions {
  agent: AgentType;
  prompt: string;
  workingDir?: string;
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
  const { agent, prompt, workingDir = process.cwd() } = options;
  
  // Build command and args based on agent type
  // claude: claude -p "prompt text"
  // opencode: opencode run "prompt text"
  const command = agent === 'opencode' ? 'opencode' : 'claude';
  const args: string[] = agent === 'opencode' 
    ? ['run', prompt]
    : ['-p', prompt];
  
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
      
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
    
    // Handle spawn errors (e.g., command not found)
    child.on('error', (error: Error) => {
      // Clean up signal handlers
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      
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
