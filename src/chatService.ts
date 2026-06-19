import { spawn, ChildProcess, exec } from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ProjectContextService } from './projectContext';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  streaming?: boolean;
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
}

export class ChatService extends EventEmitter {
  private static instance: ChatService | null = null;
  private static readonly STORAGE_KEY = 'hermes.chat.sessions';
  private static readonly ACTIVE_SESSION_KEY = 'hermes.chat.activeSession';
  private hermesPath: string = 'hermes';
  private activeProcess: ChildProcess | null = null;
  private activeSessionId: string | null = null;
  private sessions: Map<string, ChatSession> = new Map();
  private streamingBuffer: string = '';
  private projectContext?: ProjectContextService;
  private settings: ChatSettings = {
    gatewayUrl: 'http://localhost:8080',
    profile: 'default',
  };
  private cliDetected: boolean = false;
  private storage: vscode.Memento | null = null;

  private constructor() {
    super();
  }

  public static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Initialize persistence with VS Code global state.
   * Called from extension.activate() to wire up the Memento.
   */
  public initStorage(storage: vscode.Memento): void {
    this.storage = storage;
    this.restoreSessions();
  }

  /**
   * Restore sessions from persistent storage.
   */
  private restoreSessions(): void {
    if (!this.storage) return;
    try {
      const saved = this.storage.get<Record<string, ChatSession>>(ChatService.STORAGE_KEY, {});
      for (const [id, session] of Object.entries(saved)) {
        this.sessions.set(id, session);
      }
      const activeId = this.storage.get<string>(ChatService.ACTIVE_SESSION_KEY, null);
      if (activeId && this.sessions.has(activeId)) {
        this.activeSessionId = activeId;
      }
    } catch {
      // ignore corrupt data
    }
  }

  /**
   * Persist current sessions to VS Code global state.
   */
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

  public setSettings(settings: ChatSettings) {
    this.settings = { ...this.settings, ...settings };
  }

  public setActiveSession(id: string) {
    this.activeSessionId = id;
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Detect if hermes CLI is available and set its path.
   */
  public async detectHermesPath(): Promise<boolean> {
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

  /**
   * Send a chat message to Hermes and stream the response back.
   * Uses `hermes chat -q "<prompt>" --quiet` for single-shot queries.
   */
  public async sendMessage(userMessage: string): Promise<void> {
    if (this.activeProcess) {
      this.emit('error', { message: 'A request is already in progress. Please wait.' });
      return;
    }

    if (!this.cliDetected) {
      this.emit('error', { message: 'Hermes CLI not found. Make sure "hermes" is in your PATH.' });
      return;
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionKey = this.activeSessionId || `session_${Date.now()}`;
    this.activeSessionId = sessionKey;

    // Create or reuse local session
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

    // Add user message to local session
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

    // Create streaming placeholder for assistant response
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

    // Gather project context and prepend it
    let enrichedPrompt = userMessage;
    if (this.projectContext) {
      try {
        const context = await this.projectContext.getContextSummary();
        if (context) {
          enrichedPrompt = `[Project Context]\n${context}\n\n[User Query]\n${userMessage}`;
        }
      } catch {
        // context is optional — proceed without it
      }
    }

    // Spawn hermes chat -q with the enriched prompt
    this.streamResponse(sessionKey, assistantId, enrichedPrompt);
  }

  /**
   * Spawn hermes chat -q and stream stdout back to the webview.
   */
  private streamResponse(sessionId: string, msgId: string, prompt: string): void {
    this.streamingBuffer = '';

    const child = spawn(this.hermesPath, [
      'chat', '-q', prompt, '--quiet',
    ], {
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    this.activeProcess = child;

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
      this.activeProcess = null;

      const session = this.sessions.get(sessionId);
      if (session) {
        const msg = session.messages.find(m => m.id === msgId);
        if (msg) {
          msg.streaming = false;
          // Strip trailing session info lines that hermes appends
          const content = this.stripSessionInfo(this.streamingBuffer);
          msg.content = content || `(Hermes exited with code ${code})`;
          this.emit('complete', { sessionId, messageId: msgId, content: msg.content, exitCode: code });
        }
        session.updatedAt = Date.now();
        this.persistSessions();
      }
    });

    child.on('error', (err: Error) => {
      this.activeProcess = null;

      const session = this.sessions.get(sessionId);
      if (session) {
        const msg = session.messages.find(m => m.id === msgId);
        if (msg) {
          msg.streaming = false;
          msg.content = `Error: ${err.message}`;
          this.emit('error', { sessionId, messageId: msgId, message: err.message });
        }
      }
    });
  }

  /**
   * Strip the session info footer that Hermes appends to chat output.
   * Hermes appends lines like "Session: 20260619_..." at the end.
   */
  private stripSessionInfo(text: string): string {
    const lines = text.split('\n');
    // Remove trailing lines that look like session metadata
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

  /**
   * Cancel the current streaming response.
   */
  public cancelStreaming(): boolean {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
      return true;
    }
    return false;
  }

  /**
   * List sessions from Hermes CLI.
   */
  public async listSessions(): Promise<Array<{ id: string; title: string; preview: string; when: string }>> {
    if (!this.cliDetected) return [];

    return new Promise((resolve) => {
      const child = spawn(this.hermesPath, ['sessions', 'list'], {
        env: { ...process.env },
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

  /**
   * Get messages for the active or specified session.
   */
  public getSessionMessages(sessionId?: string): ChatMessage[] {
    const id = sessionId || this.activeSessionId;
    if (!id) return [];
    return this.sessions.get(id)?.messages || [];
  }

  /**
   * Start a fresh local chat session.
   */
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

  /**
   * Get all local sessions.
   */
  public getSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Check if a response is currently streaming.
   */
  public isStreaming(): boolean {
    return this.activeProcess !== null;
  }

  /**
   * Dispose and clean up resources.
   */
  public dispose(): void {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
    }
    this.sessions.clear();
    this.removeAllListeners();
    ChatService.instance = null;
  }
}
