import * as vscode from 'vscode';
import { spawn, ChildProcess, exec } from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';

export interface TerminalOutput {
  id: string;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startTime: number;
  endTime: number | null;
  status: 'running' | 'completed' | 'error' | 'cancelled';
}

export interface TerminalMessage {
  type: 'output' | 'status' | 'complete' | 'error' | 'history' | 'clear';
  data?: any;
}

export class TerminalService extends EventEmitter {
  private static instance: TerminalService | null = null;
  private processes: Map<string, ChildProcess> = new Map();
  private outputs: TerminalOutput[] = [];
  private hermesPath: string = 'hermes';
  private outputChannel: vscode.OutputChannel;

  private constructor(outputChannel?: vscode.OutputChannel) {
    super();
    this.outputChannel = outputChannel || vscode.window.createOutputChannel('Hermes Terminal');
  }

  public static getInstance(outputChannel?: vscode.OutputChannel): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService(outputChannel);
    }
    return TerminalService.instance;
  }

  /**
   * Detect the actual path to the hermes CLI.
   */
  public async detectHermesPath(): Promise<string> {
    try {
      const execAsync = promisify(exec);

      // Try 'which hermes' first
      const { stdout } = await execAsync('which hermes 2>/dev/null || where hermes 2>/dev/null');
      const detected = stdout.trim();
      if (detected) {
        this.hermesPath = detected;
        return detected;
      }

      // Fallback: check common locations
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const commonPaths = [
        '/usr/local/bin/hermes',
        home ? home + '/.local/bin/hermes' : '',
        'hermes',
      ].filter(Boolean);

      for (const p of commonPaths) {
        try {
          const { stdout } = await execAsync(`"${p}" --version`, { timeout: 5000 });
          if (stdout.includes('hermes') || stdout.includes('Hermes')) {
            this.hermesPath = p;
            return p;
          }
        } catch {
          // try next
        }
      }

      return 'hermes';
    } catch {
      return 'hermes';
    }
  }

  /**
   * Execute a Hermes CLI command and capture its output.
   * Returns a command ID that can be used to track progress.
   */
  public async executeCommand(
    command: string,
    args: string[] = [],
    cwd?: string,
    timeout: number = 60000
  ): Promise<TerminalOutput> {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const output: TerminalOutput = {
      id,
      command,
      args,
      stdout: '',
      stderr: '',
      exitCode: null,
      startTime: Date.now(),
      endTime: null,
      status: 'running',
    };

    this.outputs.unshift(output);
    this.emit('status', { id, status: 'running', command: `${command} ${args.join(' ')}` });

    return new Promise((resolve) => {
      const fullArgs = [command, ...args];
      const child = spawn(this.hermesPath, fullArgs, {
        cwd: cwd || process.cwd(),
        env: { ...process.env },
        timeout,
      });

      this.processes.set(id, child);

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdoutChunks.push(text);
        output.stdout = stdoutChunks.join('');
        this.emit('output', { id, text, type: 'stdout' });
        this.outputChannel.append(text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrChunks.push(text);
        output.stderr = stderrChunks.join('');
        this.emit('output', { id, text, type: 'stderr' });
        this.outputChannel.append(text);
      });

      child.on('close', (code: number | null) => {
        output.exitCode = code;
        output.endTime = Date.now();
        output.status = code === 0 ? 'completed' : 'error';
        this.processes.delete(id);

        this.emit('complete', {
          id,
          exitCode: code,
          stdout: output.stdout,
          stderr: output.stderr,
          duration: output.endTime - output.startTime,
        });

        this.outputChannel.appendLine(
          `✓ ${command} ${args.join(' ')} exited with code ${code} (${output.endTime! - output.startTime}ms)`
        );

        resolve(output);
      });

      child.on('error', (err: Error) => {
        output.stderr = err.message;
        output.endTime = Date.now();
        output.status = 'error';
        this.processes.delete(id);

        this.emit('error', { id, error: err.message });

        this.outputChannel.appendLine(
          `✗ ${command} ${args.join(' ')} error: ${err.message}`
        );

        resolve(output);
      });
    });
  }

  /**
   * Cancel a running command by its ID.
   */
  public cancelCommand(id: string): boolean {
    const child = this.processes.get(id);
    if (child) {
      child.kill('SIGTERM');
      const output = this.outputs.find((o) => o.id === id);
      if (output) {
        output.status = 'cancelled';
        output.endTime = Date.now();
      }
      return true;
    }
    return false;
  }

  /**
   * Get command history (most recent first).
   */
  public getHistory(limit: number = 50): TerminalOutput[] {
    return this.outputs.slice(0, limit);
  }

  /**
   * Clear command history.
   */
  public clearHistory(): void {
    this.outputs = [];
    this.emit('clear');
  }

  /**
   * Get the VS Code output channel for external inspection.
   */
  public getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  /**
   * Dispose of the service and clean up.
   */
  public dispose(): void {
    this.processes.forEach((child) => {
      child.kill('SIGTERM');
    });
    this.processes.clear();
    this.outputChannel.dispose();
    this.removeAllListeners();
    TerminalService.instance = null;
  }

  /**
   * Predefined Hermes commands for quick access.
   */
  public static readonly PREDEFINED_COMMANDS: Array<{
    id: string;
    title: string;
    command: string;
    args: string[];
    icon: string;
  }> = [
    {
      id: 'hermes.status',
      title: 'Hermes: Show Status',
      command: 'status',
      args: [],
      icon: '☢️',
    },
    {
      id: 'hermes.kanban.list',
      title: 'Hermes: List Kanban Tasks',
      command: 'kanban',
      args: ['list'],
      icon: '📋',
    },
    {
      id: 'hermes.sessions',
      title: 'Hermes: List Sessions',
      command: 'sessions',
      args: ['list'],
      icon: '📁',
    },
    {
      id: 'hermes.skills',
      title: 'Hermes: List Skills',
      command: 'skills',
      args: ['list'],
      icon: '🧠',
    },
    {
      id: 'hermes.cron',
      title: 'Hermes: List Cron Jobs',
      command: 'cron',
      args: ['list'],
      icon: '⏰',
    },
    {
      id: 'hermes.logs',
      title: 'Hermes: View Logs',
      command: 'logs',
      args: [],
      icon: '📝',
    },
    {
      id: 'hermes.config',
      title: 'Hermes: Show Config',
      command: 'config',
      args: [],
      icon: '⚙️',
    },
    {
      id: 'hermes.version',
      title: 'Hermes: Show Version',
      command: 'version',
      args: [],
      icon: '🏷️',
    },
  ];
}
