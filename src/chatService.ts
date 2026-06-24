import { spawn, ChildProcess, exec } from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import { ProjectContextService, HermesApiContext } from './projectContext';
import { buildHermesInvocation, HermesTarget } from './hermesRunner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  streaming?: boolean;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatSettings {
  gatewayUrl: string;
  profile: string;
  transport: 'auto' | 'gateway' | 'cli';
  contextMode: 'minimal' | 'workspace' | 'full';
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  /** Manual path to the hermes binary (or its directory). Overrides PATH auto-detection. */
  cliPath?: string;
  /** SSH host/server or ssh alias. When set, hermes runs remotely over SSH. */
  sshTarget?: string;
  /** SSH port (default 22). */
  sshPort?: string;
  /** SSH username (optional; ssh alias/config used if empty). */
  sshUser?: string;
  /** Path to an SSH private key (optional; ssh-agent/default keys if empty). */
  sshKey?: string;
  /** HERMES_HOME on the target — selects a specific hermes config/instance. */
  hermesHome?: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface SendOptions {
  /** Profile override for this message (falls back to settings.profile). */
  profile?: string;
  /** Model override for this message (passed as `-m`). */
  model?: string;
  /** Files attached to this message; their content is injected into the prompt. */
  files?: Array<{ name: string; content: string }>;
}

interface GatewayResponse {
  success: boolean;
  data?: {
    response?: string;
    sessionId?: string;
  };
  error?: string;
}

const DEFAULT_SETTINGS: ChatSettings = {
  gatewayUrl: '',
  profile: 'default',
  transport: 'auto',
  contextMode: 'workspace',
  timeoutMs: 120000,
  maxRetries: 2,
};

export class ChatService extends EventEmitter {
  private static instance: ChatService | null = null;
  private static readonly STORAGE_KEY = 'hermes.chat.sessions';
  private static readonly ACTIVE_SESSION_KEY = 'hermes.chat.activeSession';
  private static readonly SETTINGS_KEY = 'hermes.chat.settings.v2';
  private hermesPath: string = 'hermes';
  private activeProcess: ChildProcess | null = null;
  private activeSessionId: string | null = null;
  private sessions: Map<string, ChatSession> = new Map();
  private streamingBuffer: string = '';
  private projectContext?: ProjectContextService;
  private settings: ChatSettings = { ...DEFAULT_SETTINGS };
  private cliDetected: boolean = false;
  private gatewayAvailable: boolean = false;
  private storage: vscode.Memento | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private abortController: AbortController | null = null;

  private constructor() {
    super();
  }

  public static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  public initStorage(storage: vscode.Memento): void {
    this.storage = storage;
    this.restoreSessions();
  }

  private restoreSessions(): void {
    if (!this.storage) return;
    try {
      const saved = this.storage.get<Record<string, ChatSession>>(ChatService.STORAGE_KEY, {});
      for (const [id, session] of Object.entries(saved)) {
        this.sessions.set(id, session);
      }
      const activeId = this.storage.get<string | undefined>(ChatService.ACTIVE_SESSION_KEY, undefined);
      if (activeId && this.sessions.has(activeId)) {
        this.activeSessionId = activeId;
      }
      const savedSettings = this.storage.get<ChatSettings | undefined>(ChatService.SETTINGS_KEY, undefined);
      if (savedSettings) {
        this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
      }
    } catch {
      // ignore corrupt data
    }
  }

  private persistSessions(): void {
    if (!this.storage) return;
    try {
      const obj: Record<string, ChatSession> = {};
      for (const [id, session] of this.sessions) {
        obj[id] = session;
      }
      this.storage.update(ChatService.STORAGE_KEY, obj);
      if (this.activeSessionId) {
        this.storage.update(ChatService.ACTIVE_SESSION_KEY, this.activeSessionId);
      }
    } catch {
      // ignore storage failures
    }
  }

  public setProjectContext(service: ProjectContextService) {
    this.projectContext = service;
  }

  public setSettings(settings: Partial<ChatSettings>) {
    this.settings = { ...this.settings, ...settings };
    this.persistSettings();
  }

  private persistSettings(): void {
    if (!this.storage) return;
    try {
      this.storage.update(ChatService.SETTINGS_KEY, this.settings);
    } catch {
      // ignore storage failures
    }
  }

  public getSettings(): ChatSettings {
    return { ...this.settings };
  }

  public setActiveSession(id: string) {
    this.activeSessionId = id;
    this.persistSessions();
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public setHermesPath(path: string): void {
    this.hermesPath = path;
    this.cliDetected = true;
  }

  public getHermesPath(): string {
    return this.hermesPath;
  }

  /**
   * Apply a manually-configured hermes path. Accepts either the binary path
   * or a directory containing `hermes`. Returns true if it resolves to an
   * existing file. Sets cliDetected accordingly.
   */
  public async applyCliPath(cliPath: string): Promise<boolean> {
    const trimmed = (cliPath || '').trim();
    if (!trimmed) {
      this.cliDetected = false;
      return false;
    }
    try {
      let candidate = trimmed;
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        candidate = trimmed.replace(/[/\\]+$/, '') + '/hermes';
      }
      if (fs.existsSync(candidate)) {
        this.hermesPath = candidate;
        this.cliDetected = true;
        return true;
      }
    } catch { /* path does not exist or is not accessible */ }
    this.cliDetected = false;
    return false;
  }

  /**
   * Resolve the current hermes invocation target (local path or remote over SSH).
   * When an SSH target is set, cliPath is treated as the *remote* hermes path.
   */
  public hermesTarget(): HermesTarget {
    const ssh = (this.settings.sshTarget || '').trim();
    if (ssh) {
      return {
        hermesPath: (this.settings.cliPath || '').trim() || 'hermes',
        sshTarget: ssh,
        sshPort: this.settings.sshPort,
        sshUser: this.settings.sshUser,
        sshKey: this.settings.sshKey,
        hermesHome: this.settings.hermesHome,
      };
    }
    return { hermesPath: this.hermesPath, hermesHome: this.settings.hermesHome };
  }

  public isSshMode(): boolean {
    return !!(this.settings.sshTarget || '').trim();
  }

  /**
   * Verify a remote hermes is reachable by running `hermes version` over SSH.
   */
  private checkSshHermes(): Promise<boolean> {
    const inv = buildHermesInvocation(this.hermesTarget(), ['version']);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.cliDetected = ok;
        resolve(ok);
      };
      const child = spawn(inv.command, inv.args, { env: { ...process.env, ...(inv.env || {}) } });
      const timer = setTimeout(() => { child.kill('SIGTERM'); finish(false); }, 12000);
      child.on('close', (code) => finish(code === 0));
      child.on('error', () => finish(false));
    });
  }

  public async detectHermesPath(): Promise<boolean> {
    // Remote hermes over SSH takes priority when configured.
    if (this.isSshMode()) {
      return this.checkSshHermes();
    }
    // A manually-configured path (from Settings) takes priority over PATH lookup.
    const manual = (this.settings.cliPath || '').trim();
    if (manual && await this.applyCliPath(manual)) {
      return true;
    }
    try {
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('which hermes 2>/dev/null || where hermes 2>/dev/null');
      const detected = stdout.trim();
      if (detected) {
        this.hermesPath = detected;
        this.cliDetected = true;
        return true;
      }
    } catch { /* ignore */ }
    this.cliDetected = false;
    return false;
  }

  public isCliAvailable(): boolean {
    return this.cliDetected;
  }

  // --- Connection & transport ---

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit('connectionStatus', { status });
    }
  }

  /**
   * Probe the gateway health endpoint.
   * Returns true if the gateway responds within 3 seconds.
   */
  public async checkGateway(): Promise<boolean> {
    const gatewayUrl = (this.settings.gatewayUrl || '').trim();
    if (!gatewayUrl) {
      this.gatewayAvailable = false;
      return false;
    }
    const url = gatewayUrl.replace(/\/+$/, '') + '/health';
    try {
      const response = await this.httpRequest('GET', url, undefined, 3000);
      this.gatewayAvailable = response.statusCode >= 200 && response.statusCode < 400;
    } catch {
      this.gatewayAvailable = false;
    }
    return this.gatewayAvailable;
  }

  public isGatewayAvailable(): boolean {
    return this.gatewayAvailable;
  }

  /**
   * Determine the best transport for sending messages.
   * Priority: gateway (if available and configured) > CLI (if detected) > error.
   */
  private resolveTransport(): 'gateway' | 'cli' {
    if (this.settings.transport === 'gateway') {
      if (!(this.settings.gatewayUrl || '').trim()) {
        throw new Error('Gateway URL is not configured.');
      }
      if (this.gatewayAvailable) return 'gateway';
      if (this.cliDetected) return 'cli';
      throw new Error('No transport available: gateway unreachable and CLI not found.');
    }
    if (this.settings.transport === 'cli') {
      if (!this.cliDetected) throw new Error('Hermes CLI not found in PATH.');
      return 'cli';
    }
    // auto: prefer gateway, fallback to CLI
    if (this.gatewayAvailable) return 'gateway';
    if (this.cliDetected) return 'cli';
    throw new Error('No Hermes transport available. Check CLI is installed or gateway is running.');
  }

  // --- Chat ---

  public async sendMessage(userMessage: string, options?: SendOptions): Promise<void> {
    if (this.activeProcess || this.abortController) {
      this.emit('error', { message: 'A request is already in progress. Please wait or cancel first.' });
      return;
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionKey = this.activeSessionId || `session_${Date.now()}`;
    this.activeSessionId = sessionKey;

    if (!this.sessions.has(sessionKey)) {
      this.sessions.set(sessionKey, {
        id: sessionKey,
        title: userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : ''),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    const session = this.sessions.get(sessionKey)!;

    const userMsg: ChatMessage = {
      id: messageId,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    session.messages.push(userMsg);
    session.updatedAt = Date.now();
    this.persistSessions();
    this.emit('message', { sessionId: sessionKey, message: userMsg });

    const assistantId = `msg_${Date.now()}_assistant`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };
    session.messages.push(assistantMsg);
    this.emit('message', { sessionId: sessionKey, message: assistantMsg });

    this.setConnectionStatus('connecting');

    let transport: 'gateway' | 'cli';
    try {
      transport = this.resolveTransport();
    } catch (err: any) {
      this.finalizeError(sessionKey, assistantId, err.message);
      this.setConnectionStatus('error');
      return;
    }

    let apiContext: HermesApiContext | undefined;
    if (this.projectContext) {
      try {
        apiContext = await this.projectContext.formatForHermesApi(this.settings.contextMode || 'workspace');
      } catch {
        // context is optional
      }
    }

    if (transport === 'gateway') {
      await this.sendViaGateway(sessionKey, assistantId, userMessage, apiContext, options);
    } else {
      this.sendViaCli(sessionKey, assistantId, userMessage, apiContext, options);
    }
  }

  /** Build an "[Attached Files]" prompt section from attachments. */
  private formatAttachments(files?: Array<{ name: string; content: string }>): string {
    if (!files || files.length === 0) return '';
    const blocks = files.map(f => {
      const body = f.content.length > 100000 ? f.content.slice(0, 100000) + '\n…(truncated)' : f.content;
      return `--- ${f.name} ---\n${body}`;
    });
    return '[Attached Files]\n' + blocks.join('\n\n');
  }

  // --- Gateway transport ---

  private async sendViaGateway(
    sessionId: string,
    msgId: string,
    userMessage: string,
    context?: HermesApiContext,
    options?: SendOptions
  ): Promise<void> {
    const gatewayUrl = (this.settings.gatewayUrl || '').trim();
    if (!gatewayUrl) {
      this.finalizeError(sessionId, msgId, 'Gateway URL is not configured.');
      this.setConnectionStatus('error');
      return;
    }
    const url = gatewayUrl.replace(/\/+$/, '') + '/v1/chat';
    const history = this.getConversationHistory(sessionId, msgId);

    const payload: Record<string, any> = {
      message: userMessage,
      session_id: sessionId,
      profile: (options?.profile || this.settings.profile),
      history,
    };
    if (options?.model) {
      payload.model = options.model;
    }
    if (options?.files && options.files.length > 0) {
      payload.files = options.files;
    }
    if (context) {
      payload.context = context;
    }

    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.settings.timeoutMs);

    let lastError: Error | null = null;
    const maxAttempts = this.settings.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.abortController?.signal.aborted) break;

      try {
        const response = await this.httpRequest(
          'POST',
          url,
          JSON.stringify(payload),
          this.settings.timeoutMs,
          this.abortController?.signal,
          this.settings.apiKey
        );

        clearTimeout(timeoutId);

        if (response.statusCode >= 200 && response.statusCode < 300) {
          const parsed = JSON.parse(response.body) as GatewayResponse;
          if (parsed.success && parsed.data?.response) {
            this.finalizeSuccess(sessionId, msgId, parsed.data.response);
            this.setConnectionStatus('connected');
            return;
          }
          // Non-success response from gateway
          lastError = new Error(parsed.error || 'Gateway returned no response.');
        } else if (response.statusCode === 429 || response.statusCode >= 500) {
          // Retryable
          lastError = new Error(`Gateway returned ${response.statusCode}`);
          if (attempt < maxAttempts) {
            await this.delay(1000 * Math.pow(2, attempt - 1));
            continue;
          }
        } else {
          lastError = new Error(`Gateway error ${response.statusCode}: ${response.body.slice(0, 200)}`);
          break;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = new Error('Request timed out.');
          break;
        }
        lastError = err;
        if (attempt < maxAttempts) {
          await this.delay(1000 * Math.pow(2, attempt - 1));
          continue;
        }
      }
    }

    clearTimeout(timeoutId);
    this.abortController = null;

    // Gateway failed — try CLI fallback if auto transport
    if (this.settings.transport === 'auto' && this.cliDetected) {
      this.emit('stream', { sessionId, messageId: msgId, content: 'Gateway unavailable, falling back to CLI...' });
      this.sendViaCli(sessionId, msgId, userMessage, context);
      return;
    }

    this.finalizeError(sessionId, msgId, lastError?.message || 'Gateway request failed.');
    this.setConnectionStatus('error');
  }

  // --- CLI transport ---

  private sendViaCli(
    sessionId: string,
    msgId: string,
    userMessage: string,
    context?: HermesApiContext,
    options?: SendOptions
  ): void {
    this.streamingBuffer = '';
    const historyParts = this.getConversationHistoryText(sessionId, msgId);
    const attachments = this.formatAttachments(options?.files);

    const parts: string[] = [];
    if (context) {
      try { parts.push('[Project Context]\n' + this.formatContextAsText(context)); } catch { /* skip */ }
    }
    if (attachments) parts.push(attachments);
    if (historyParts.length > 0) parts.push('[Conversation History]\n' + historyParts);
    let enrichedPrompt = userMessage;
    if (parts.length > 0) {
      enrichedPrompt = parts.join('\n\n') + '\n\n[User Query]\n' + userMessage;
    }

    const args = ['chat', '-q', enrichedPrompt, '--quiet'];
    const profile = (options?.profile || this.settings.profile || '').trim();
    if (profile && profile !== 'default') {
      args.push('--profile', profile);
    }
    const model = (options?.model || '').trim();
    if (model) {
      args.push('-m', model);
    }

    const inv = buildHermesInvocation(this.hermesTarget(), args);
    const child = spawn(inv.command, inv.args, {
      cwd: !this.isSshMode() && context?.project.root ? context.project.root : undefined,
      env: { ...process.env, ...(inv.env || {}), FORCE_COLOR: '0' },
    });

    this.activeProcess = child;

    const timeoutId = setTimeout(() => {
      if (this.activeProcess === child) {
        child.kill('SIGTERM');
        this.finalizeError(sessionId, msgId, 'Request timed out after ' + this.settings.timeoutMs + 'ms.');
        this.setConnectionStatus('error');
      }
    }, this.settings.timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.streamingBuffer += text;

      const session = this.sessions.get(sessionId);
      if (session) {
        const msg = session.messages.find(m => m.id === msgId);
        if (msg) {
          msg.content = this.streamingBuffer;
          this.emit('stream', { sessionId, messageId: msgId, content: this.streamingBuffer });
        }
        session.updatedAt = Date.now();
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text && !text.match(/^(DEPRECATION|Warning:)/)) {
        this.emit('error', { message: text });
      }
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      this.activeProcess = null;

      if (code === 0 && this.streamingBuffer.trim()) {
        const content = this.stripSessionInfo(this.streamingBuffer);
        this.finalizeSuccess(sessionId, msgId, content);
        this.setConnectionStatus('connected');
      } else if (code !== 0) {
        this.finalizeError(sessionId, msgId, `Hermes CLI exited with code ${code}.`);
        this.setConnectionStatus('error');
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutId);
      this.activeProcess = null;
      this.finalizeError(sessionId, msgId, `CLI error: ${err.message}`);
      this.setConnectionStatus('error');
    });
  }

  // --- Finalize helpers ---

  private finalizeSuccess(sessionId: string, msgId: string, content: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const msg = session.messages.find(m => m.id === msgId);
      if (msg) {
        msg.streaming = false;
        msg.content = content;
        this.emit('complete', { sessionId, messageId: msgId, content });
      }
      session.updatedAt = Date.now();
      this.persistSessions();
    }
    this.abortController = null;
  }

  private finalizeError(sessionId: string, msgId: string, errorMessage: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const msg = session.messages.find(m => m.id === msgId);
      if (msg) {
        msg.streaming = false;
        msg.error = true;
        msg.content = errorMessage;
        this.emit('error', { sessionId, messageId: msgId, message: errorMessage });
      }
      session.updatedAt = Date.now();
      this.persistSessions();
    }
    this.activeProcess = null;
    this.abortController = null;
  }

  // --- Conversation history ---

  private getConversationHistory(sessionId: string, excludeMsgId: string): Array<{ role: string; content: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.messages
      .filter(m => m.id !== excludeMsgId && m.content && !m.error && (m.role === 'user' || m.role === 'assistant'))
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  }

  private getConversationHistoryText(sessionId: string, excludeMsgId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';
    const history = session.messages
      .filter(m => m.id !== excludeMsgId && m.content && !m.error)
      .slice(-10);
    if (history.length === 0) return '';
    return history.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const preview = m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content;
      return `[${role}]: ${preview}`;
    }).join('\n');
  }

  private formatContextAsText(ctx: HermesApiContext): string {
    const lines: string[] = [];
    if (ctx.project.name) {
      lines.push(`Project: ${ctx.project.name} (${ctx.project.root || 'unknown path'})`);
    }
    if (ctx.project.type) {
      lines.push(`Type: ${ctx.project.type}`);
    }
    if (ctx.git) {
      const g = ctx.git;
      lines.push(`Git: ${g.branch} (+${g.ahead}/-${g.behind}, ${g.staged} staged, ${g.unstaged} unstaged)`);
    }
    if (ctx.contextAccess) {
      lines.push(`Context access: ${ctx.contextAccess.description}`);
    }
    if (ctx.keyFiles.length > 0) {
      lines.push(`Key files: ${ctx.keyFiles.map(f => f.relativePath).join(', ')}`);
    }
    if (ctx.openFiles.length > 0) {
      lines.push(`Open files: ${ctx.openFiles.map(f => f.relativePath).join(', ')}`);
    }
    if (ctx.activeFile) {
      lines.push(`Active: ${ctx.activeFile.relativePath} (${ctx.activeFile.language})`);
    }
    if (ctx.activeSelection) {
      const preview = ctx.activeSelection.length > 500 ? ctx.activeSelection.slice(0, 500) + '...' : ctx.activeSelection;
      lines.push(`Selection:\n${preview}`);
    }
    if (ctx.workspaceFiles && ctx.workspaceFiles.length > 0) {
      lines.push(`Workspace file index (${ctx.workspaceFiles.length} files):`);
      lines.push(ctx.workspaceFiles.slice(0, 1000).map(f => `  - ${f}`).join('\n'));
    }
    if (ctx.contextAccess?.allowWorkspaceRead && ctx.project.root) {
      lines.push(`Workspace read permission: The user selected Full project mode. You may inspect files under ${ctx.project.root} when needed. Do not read files outside the workspace unless the user explicitly asks.`);
    }
    return lines.join('\n');
  }

  // --- HTTP utility ---

  private httpRequest(
    method: string,
    url: string,
    body?: string,
    timeoutMs: number = 10000,
    signal?: AbortSignal,
    apiKey?: string
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (body) {
        headers['Content-Length'] = String(Buffer.byteLength(body));
      }

      const req = lib.request({
        method,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers,
        timeout: timeoutMs,
        signal,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  // --- Utilities ---

  private stripSessionInfo(text: string): string {
    const lines = text.split('\n');
    while (lines.length > 0) {
      const last = lines[lines.length - 1].trim();
      if (last.startsWith('Session:') || last.startsWith('session:') || last.match(/^20\d{6}_\d{6}_\w+$/)) {
        lines.pop();
      } else {
        break;
      }
    }
    return lines.join('\n').trim();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract actionable terminal commands from assistant response text.
   * Returns commands that can be executed in the IDE terminal.
   */
  public extractCommands(text: string): Array<{ command: string; label: string }> {
    const commands: Array<{ command: string; label: string }> = [];
    const codeBlockRegex = /```(?:sh|bash|shell|terminal)?\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const block = match[1].trim();
      const lines = block.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('hermes ') || trimmed.startsWith('$ hermes ')) {
          const cmd = trimmed.replace(/^\$\s*/, '');
          commands.push({ command: cmd, label: cmd });
        }
      }
    }
    // Also match inline `hermes ...` commands
    const inlineRegex = /`(hermes\s+[^`]+)`/g;
    while ((match = inlineRegex.exec(text)) !== null) {
      const cmd = match[1].trim();
      if (!commands.some(c => c.command === cmd)) {
        commands.push({ command: cmd, label: cmd });
      }
    }
    return commands;
  }

  /**
   * Extract file references from assistant response text.
   * Returns paths that can be opened in the editor.
   */
  public extractFileRefs(text: string): Array<{ path: string; line?: number }> {
    const refs: Array<{ path: string; line?: number }> = [];
    // Match `path/to/file.ext` and `path/to/file.ext:42`
    const regex = /`([^`\s]+\.\w{2,5})(?::(\d+))?`/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1];
      const line = match[2] ? parseInt(match[2], 10) : undefined;
      if (!refs.some(r => r.path === filePath)) {
        refs.push({ path: filePath, line });
      }
    }
    return refs;
  }

  public cancelStreaming(): boolean {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    return true;
  }

  public async listSessions(): Promise<Array<{ id: string; title: string; preview: string; when: string }>> {
    if (!this.cliDetected) return [];

    return new Promise((resolve) => {
      const inv = buildHermesInvocation(this.hermesTarget(), ['sessions', 'list']);
      const child = spawn(inv.command, inv.args, {
        env: { ...process.env, ...(inv.env || {}) },
      });

      let stdout = '';
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });

      child.on('close', () => {
        resolve(this.parseSessionsOutput(stdout));
      });
    });
  }

  private parseSessionsOutput(output: string): Array<{ id: string; title: string; preview: string; when: string }> {
    const results: Array<{ id: string; title: string; preview: string; when: string }> = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (let i = 3; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('─') || line.startsWith('Title')) continue;

      const match = line.match(/^(.{30,45})\s+(.{30,50})\s+(.{8,15})\s+(\S+)/);
      if (match) {
        results.push({
          id: match[4].trim(),
          title: match[1].trim(),
          preview: match[2].trim(),
          when: match[3].trim(),
        });
      }
    }
    return results;
  }

  public getSessionMessages(sessionId?: string): ChatMessage[] {
    const id = sessionId || this.activeSessionId;
    if (!id) return [];
    return this.sessions.get(id)?.messages || [];
  }

  public newSession(): string {
    const id = `session_${Date.now()}`;
    this.sessions.set(id, {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.activeSessionId = id;
    this.persistSessions();
    this.emit('newSession', { sessionId: id });
    return id;
  }

  public getSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * List hermes profiles on the active target (local or over SSH).
   */
  public listProfiles(): Promise<Array<{ name: string; model: string; active: boolean }>> {
    const inv = buildHermesInvocation(this.hermesTarget(), ['profile', 'list']);
    return new Promise((resolve) => {
      let out = '';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this.parseProfiles(out));
      };
      const child = spawn(inv.command, inv.args, { env: { ...process.env, ...(inv.env || {}) } });
      const timer = setTimeout(() => { child.kill('SIGTERM'); finish(); }, 10000);
      child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      child.on('close', finish);
      child.on('error', () => finish());
    });
  }

  private parseProfiles(output: string): Array<{ name: string; model: string; active: boolean }> {
    const results: Array<{ name: string; model: string; active: boolean }> = [];
    for (const raw of output.split('\n')) {
      // Strip ANSI colour codes, then normalise.
      const line = raw.replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "");
      const t = line.trim();
      if (!t || t.startsWith('Profile') || /^[\s─\-—=]+$/.test(t)) continue;
      const active = t.startsWith('◆');
      const cleaned = t.replace(/^◆\s*/, '');
      const cols = cleaned.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
      const name = cols[0] || '';
      if (!name || name.includes('://')) continue;
      results.push({ name, model: cols[1] || '', active });
    }
    return results;
  }

  public isStreaming(): boolean {
    return this.activeProcess !== null || this.abortController !== null;
  }

  /**
   * Retry the last failed message by re-sending it.
   */
  public async retryLastMessage(): Promise<void> {
    if (!this.activeSessionId) return;
    const session = this.sessions.get(this.activeSessionId);
    if (!session || session.messages.length < 2) return;

    // Find the last user message
    const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    // Remove the failed assistant message
    const lastIdx = session.messages.length - 1;
    if (session.messages[lastIdx]?.role === 'assistant' && session.messages[lastIdx]?.error) {
      session.messages.pop();
    }

    this.persistSessions();
    await this.sendMessage(lastUserMsg.content);
  }

  public dispose(): void {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    this.sessions.clear();
    this.removeAllListeners();
    ChatService.instance = null;
  }
}
