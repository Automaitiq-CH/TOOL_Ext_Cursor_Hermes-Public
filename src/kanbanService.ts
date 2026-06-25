import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';

export type KanbanStatus = 'todo' | 'ready' | 'running' | 'blocked' | 'done' | 'archived';

export interface KanbanTask {
  id: string;
  title: string;
  body?: string;
  assignee: string;
  status: KanbanStatus;
  priority: number;
  tenant?: string | null;
  workspaceKind?: string;
  workspacePath?: string;
  createdBy?: string;
  createdAt?: number;
  startedAt?: number | null;
  completedAt?: number | null;
  result?: string | null;
  parents?: string[];
  children?: string[];
  currentRunId?: number | null;
}

export interface KanbanBoard {
  tasks: KanbanTask[];
  columns: Record<KanbanStatus, KanbanTask[]>;
  updatedAt: number;
  source: 'gateway' | 'cli' | 'cache';
}

export interface KanbanColumnSummary {
  status: KanbanStatus;
  label: string;
  count: number;
  tasks: KanbanTask[];
}

const COLUMN_ORDER: KanbanStatus[] = ['todo', 'ready', 'running', 'blocked', 'done'];

const COLUMN_LABELS: Record<KanbanStatus, string> = {
  todo: 'To Do',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
};

export class KanbanService extends EventEmitter {
  private board: KanbanBoard | null = null;
  private cacheTtlMs: number = 30000;
  private gatewayUrl: string = 'http://localhost:8080';
  private profile: string = 'default';
  private useGateway: boolean = false;

  public setGatewayUrl(url: string): void {
    this.gatewayUrl = url.replace(/\/+$/, '');
  }

  public setProfile(profile: string): void {
    this.profile = profile;
  }

  public setUseGateway(use: boolean): void {
    this.useGateway = use;
  }

  public setCacheTtl(ms: number): void {
    this.cacheTtlMs = ms;
  }

  public getBoard(): KanbanBoard | null {
    return this.board;
  }

  public isStale(): boolean {
    if (!this.board) return true;
    return (Date.now() - this.board.updatedAt) > this.cacheTtlMs;
  }

  public getColumns(): KanbanColumnSummary[] {
    if (!this.board) {
      return COLUMN_ORDER.map(status => ({
        status,
        label: COLUMN_LABELS[status],
        count: 0,
        tasks: [],
      }));
    }

    return COLUMN_ORDER.map(status => ({
      status,
      label: COLUMN_LABELS[status],
      count: this.board!.columns[status]?.length ?? 0,
      tasks: this.board!.columns[status] ?? [],
    }));
  }

  public getTasksByStatus(status: KanbanStatus): KanbanTask[] {
    return this.board?.columns[status] ?? [];
  }

  public getTaskById(id: string): KanbanTask | undefined {
    return this.board?.tasks.find(t => t.id === id);
  }

  public getStats(): Record<KanbanStatus, number> {
    const stats: Record<string, number> = {};
    for (const s of COLUMN_ORDER) {
      stats[s] = this.board?.columns[s]?.length ?? 0;
    }
    stats['archived'] = this.board?.columns['archived']?.length ?? 0;
    return stats as Record<KanbanStatus, number>;
  }

  public filterTasks(query: string): KanbanTask[] {
    if (!this.board || !query.trim()) {
      return this.board?.tasks ?? [];
    }
    const q = query.toLowerCase();
    return this.board.tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.assignee.toLowerCase().includes(q) ||
      (t.body && t.body.toLowerCase().includes(q))
    );
  }

  public async fetchBoard(hermesPath?: string): Promise<KanbanBoard> {
    if (!this.isStale() && this.board) {
      return this.board;
    }

    if (this.useGateway) {
      try {
        const board = await this.fetchFromGateway();
        this.board = board;
        this.emit('boardUpdated', board);
        return board;
      } catch {
        // fallback to CLI
      }
    }

    const board = await this.fetchFromCli(hermesPath || 'hermes');
    this.board = board;
    this.emit('boardUpdated', board);
    return board;
  }

  public invalidateCache(): void {
    this.board = null;
  }

  private async fetchFromGateway(): Promise<KanbanBoard> {
    const url = `${this.gatewayUrl}/v1/kanban/list?profile=${encodeURIComponent(this.profile)}`;

    const response = await this.httpRequest('GET', url, undefined, 10000);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Gateway returned ${response.statusCode}`);
    }

    const parsed = JSON.parse(response.body);
    const tasks = this.parseTaskList(parsed);
    return this.buildBoard(tasks, 'gateway');
  }

  private async fetchFromCli(hermesPath: string): Promise<KanbanBoard> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const child = spawn(hermesPath, ['kanban', 'list', '--json'], {
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 15000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const tasks = this.parseTaskList(parsed);
          resolve(this.buildBoard(tasks, 'cli'));
        } catch {
          const tasks = this.parsePlainText(stdout);
          resolve(this.buildBoard(tasks, 'cli'));
        }
      });

      child.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  public parseTaskList(data: any): KanbanTask[] {
    if (!data) return [];

    let rawTasks: any[] = [];

    if (Array.isArray(data)) {
      rawTasks = data;
    } else if (data.tasks && Array.isArray(data.tasks)) {
      rawTasks = data.tasks;
    } else if (data.cards && Array.isArray(data.cards)) {
      rawTasks = data.cards;
    } else if (typeof data === 'object' && !Array.isArray(data)) {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          rawTasks = data[key];
          break;
        }
      }
    }

    return rawTasks.map(t => this.normalizeTask(t)).filter(Boolean) as KanbanTask[];
  }

  public parsePlainText(text: string): KanbanTask[] {
    const tasks: KanbanTask[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const match = line.match(/(t_[a-f0-9]{8})\s+(?:\|?\s*)?(\w+)\s+(?:\|?\s*)?(.+?)(?:\s+\|?\s+(\w+))?\s*$/);
      if (match) {
        tasks.push({
          id: match[1],
          status: this.normalizeStatus(match[2]),
          title: match[3].trim(),
          assignee: match[4] || 'unknown',
          priority: 0,
        });
      }
    }

    return tasks;
  }

  private normalizeTask(raw: any): KanbanTask | null {
    if (!raw || typeof raw !== 'object') return null;

    const id = raw.id || raw.task_id || raw.card_id;
    const title = raw.title || raw.name || 'Untitled';
    if (!id) return null;

    return {
      id,
      title,
      body: raw.body || raw.description || undefined,
      assignee: raw.assignee || raw.assigned_to || 'unassigned',
      status: this.normalizeStatus(raw.status),
      priority: typeof raw.priority === 'number' ? raw.priority : 0,
      tenant: raw.tenant || null,
      workspaceKind: raw.workspace_kind || raw.workspaceKind,
      workspacePath: raw.workspace_path || raw.workspacePath,
      createdBy: raw.created_by || raw.createdBy,
      createdAt: raw.created_at || raw.createdAt,
      startedAt: raw.started_at || raw.startedAt || null,
      completedAt: raw.completed_at || raw.completedAt || null,
      result: raw.result || null,
      parents: raw.parents || [],
      children: raw.children || [],
      currentRunId: raw.current_run_id || raw.currentRunId || null,
    };
  }

  public normalizeStatus(raw: string | undefined): KanbanStatus {
    if (!raw) return 'todo';
    const s = raw.toLowerCase().trim();
    if (['todo', 'ready', 'running', 'blocked', 'done', 'archived'].includes(s)) {
      return s as KanbanStatus;
    }
    if (s === 'in_progress' || s === 'in-progress' || s === 'active') return 'running';
    if (s === 'completed' || s === 'finished') return 'done';
    if (s === 'waiting' || s === 'pending') return 'ready';
    if (s === 'stuck' || s === 'needs_input') return 'blocked';
    return 'todo';
  }

  private buildBoard(tasks: KanbanTask[], source: 'gateway' | 'cli' | 'cache'): KanbanBoard {
    const columns: Record<KanbanStatus, KanbanTask[]> = {
      todo: [],
      ready: [],
      running: [],
      blocked: [],
      done: [],
      archived: [],
    };

    for (const task of tasks) {
      if (columns[task.status]) {
        columns[task.status].push(task);
      } else {
        columns['todo'].push(task);
      }
    }

    for (const status of Object.keys(columns) as KanbanStatus[]) {
      columns[status].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
    }

    return {
      tasks,
      columns,
      updatedAt: Date.now(),
      source,
    };
  }

  private httpRequest(
    method: string,
    url: string,
    body?: string,
    timeout: number = 10000,
    signal?: AbortSignal,
    apiKey?: string
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const req = lib.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        timeout,
        signal,
      }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body: data });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}
