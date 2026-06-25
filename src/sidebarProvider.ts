import * as vscode from 'vscode';
import { ProjectContextService } from './projectContext';
import { TerminalService } from './terminalService';
import { FileNavigationService } from './fileNavigation';
import { ChatService } from './chatService';

export class HermesSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hermesSidebar';
  private view?: vscode.WebviewView;
  private terminalService?: TerminalService;
  private fileNavigation?: FileNavigationService;
  private chatService?: ChatService;
  // Last known statuses, replayed when the webview signals it is ready.
  // The webview can resolve after these are first emitted, so we must re-send.
  private lastChatStatus: 'ready' | 'no-cli' | 'connecting' | null = null;
  private lastConnectionStatus: string | null = null;
  // Files attached to the next chat message (picked via the composer).
  private pendingAttachments: Array<{ name: string; content: string }> = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectContext?: ProjectContextService,
    fileNavigation?: FileNavigationService
  ) {
    this.fileNavigation = fileNavigation;
  }

  public setTerminalService(service: TerminalService) {
    this.terminalService = service;
  }

  public setChatService(service: ChatService) {
    this.chatService = service;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'ready':
          console.log('Hermes sidebar webview ready');
          this.sendRestoredSession();
          this.sendChatHistory();
          this.sendProjectContext();
          this.sendSettings();
          // Replay statuses that may have been emitted before the webview was listening.
          if (this.lastChatStatus) {
            this.view?.webview.postMessage({ command: 'chatStatus', status: this.lastChatStatus });
          }
          if (this.lastConnectionStatus) {
            this.view?.webview.postMessage({ command: 'connectionStatus', status: this.lastConnectionStatus });
          }
          break;
        case 'getContext':
          this.sendProjectContext();
          break;
        case 'executeCommand':
          this.handleExecuteCommand(message.commandId, message.args);
          break;
        case 'executeCustomCommand':
          this.handleExecuteCustomCommand(message.input);
          break;
        case 'clearTerminal':
          this.terminalService?.clearHistory();
          this.view?.webview.postMessage({ command: 'clearTerminal' });
          break;
        case 'cancelCommand':
          this.terminalService?.cancelCommand(message.id);
          break;
        case 'openFile':
          this.handleOpenFile(message.filePath, message.line, message.character);
          break;
        case 'revealInExplorer':
          this.handleRevealInExplorer(message.filePath);
          break;
        case 'listFiles':
          this.handleListFiles(message.filter, message.limit);
          break;
        case 'searchFiles':
          this.handleSearchFiles(message.query, message.limit);
          break;
        case 'getOpenFiles':
          this.handleGetOpenFiles();
          break;
        case 'switchEditor':
          this.handleSwitchEditor(message.direction);
          break;
        case 'sendMessage':
          this.handleSendMessage(message.text, message.sessionId, { profile: message.profile, model: message.model });
          break;
        case 'loadProfiles':
          this.handleLoadProfiles();
          break;
        case 'loadModels':
          this.handleLoadModels();
          break;
        case 'pickFiles':
          this.handlePickFiles();
          break;
        case 'removeAttachment':
          this.handleRemoveAttachment(message.name);
          break;
        case 'saveSettings':
          this.handleSaveSettings(message.settings);
          break;
        case 'selectSshKey':
          this.handleSelectSshKey();
          break;
        case 'loadChatHistory':
          this.sendChatHistory();
          break;
        case 'openChatSession':
          this.handleOpenChatSession(message.sessionId);
          break;
        case 'loadKanban':
          this.handleLoadKanban();
          break;
        case 'loadSessions':
          this.handleLoadSessions();
          break;
        case 'cancelStreaming':
          this.chatService?.cancelStreaming();
          this.view?.webview.postMessage({ command: 'cancelStreaming' });
          break;
        case 'newChatSession': {
          const newId = this.chatService?.newSession() || '';
          this.view?.webview.postMessage({ command: 'newChatSession', sessionId: newId });
          this.sendChatHistory();
          break;
        }
        case 'retryLastMessage':
          this.handleRetryLastMessage();
          break;
        case 'runChatCommand':
          this.handleRunChatCommand(message.command);
          break;
        case 'openFileRef':
          this.handleOpenFile(message.filePath, message.line, message.character);
          break;
        case 'checkGateway':
          this.handleCheckGateway();
          break;
        default:
          console.log(`Unknown message: ${message.command}`);
      }
    });
  }

  private async handleExecuteCommand(commandId: string, args: string[] = []) {
    if (!this.terminalService) {
      console.error('Terminal service not initialized');
      return;
    }

    const cmd = TerminalService.PREDEFINED_COMMANDS.find((c) => c.id === commandId);
    if (!cmd) {
      console.error(`Unknown command: ${commandId}`);
      return;
    }

    try {
      await this.terminalService.executeCommand(cmd.command, [...cmd.args, ...args]);
    } catch (err) {
      console.error(`Failed to execute command ${commandId}:`, err);
    }
  }

  private async handleExecuteCustomCommand(input: string) {
    if (!this.terminalService) {
      console.error('Terminal service not initialized');
      return;
    }

    const parts = input.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    try {
      await this.terminalService.executeCommand(command, args);
    } catch (err) {
      console.error(`Failed to execute custom command:`, err);
    }
  }

  public updateStatus(status: 'connected' | 'disconnected' | 'connecting') {
    this.view?.webview.postMessage({ command: 'status', status });
  }

  public sendTerminalOutput(data: any) {
    this.view?.webview.postMessage({ command: 'terminalOutput', data });
  }

  public sendTerminalHistory() {
    if (!this.terminalService || !this.view) return;
    const history = this.terminalService.getHistory();
    this.view.webview.postMessage({ command: 'terminalHistory', data: history });
  }

  public async sendProjectContext() {
    if (!this.projectContext || !this.view) {
      return;
    }
    try {
      const contextMode = this.chatService?.getSettings().contextMode || 'workspace';
      const [summary, apiContext] = await Promise.all([
        this.projectContext.getContextSummary(),
        this.projectContext.formatForHermesApi(contextMode),
      ]);
      this.view.webview.postMessage({
        command: 'projectContext',
        summary,
        context: apiContext,
      });
    } catch (err) {
      console.error('Failed to get project context:', err);
    }
  }

  // --- Chat handlers ---

  public async handleSendMessage(text: string, sessionId?: string, options?: { profile?: string; model?: string }) {
    if (!this.chatService) {
      console.error('Chat service not initialized');
      return;
    }
    try {
      if (sessionId) {
        this.chatService.setActiveSession(sessionId);
      }
      // Consume any pending attachments for this message.
      const files = this.pendingAttachments.length ? this.pendingAttachments.slice() : undefined;
      this.pendingAttachments = [];
      this.view?.webview.postMessage({ command: 'attachedFiles', files: [] });
      await this.chatService.sendMessage(text, { profile: options?.profile, model: options?.model, files });
    } catch (err) {
      console.error('Failed to send chat message:', err);
      this.view?.webview.postMessage({ command: 'chatError', message: String(err) });
    }
  }

  private async handleLoadProfiles() {
    if (!this.chatService || !this.view) return;
    try {
      const profiles = await this.chatService.listProfiles();
      this.view.webview.postMessage({ command: 'profilesData', profiles });
    } catch {
      this.view.webview.postMessage({ command: 'profilesData', profiles: [] });
    }
  }

  private async handleLoadModels() {
    if (!this.chatService || !this.view) return;
    try {
      const groups = await this.chatService.listModels();
      this.view.webview.postMessage({ command: 'modelsData', groups });
    } catch {
      this.view.webview.postMessage({ command: 'modelsData', groups: [] });
    }
  }

  private async handlePickFiles() {
    if (!this.view) return;
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Attach to Hermes',
    });
    if (!uris || uris.length === 0) return;
    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.length > 500000) {
          this.view.webview.postMessage({ command: 'chatError', message: `File too large to attach: ${uri.fsPath}` });
          continue;
        }
        const content = Buffer.from(bytes).toString('utf8');
        const name = uri.path.split('/').pop() || uri.fsPath;
        if (!this.pendingAttachments.some(a => a.name === name)) {
          this.pendingAttachments.push({ name, content });
        }
      } catch {
        this.view.webview.postMessage({ command: 'chatError', message: `Could not read file: ${uri.fsPath}` });
      }
    }
    this.view.webview.postMessage({
      command: 'attachedFiles',
      files: this.pendingAttachments.map(a => ({ name: a.name })),
    });
  }

  private handleRemoveAttachment(name: string) {
    this.pendingAttachments = this.pendingAttachments.filter(a => a.name !== name);
    this.view?.webview.postMessage({
      command: 'attachedFiles',
      files: this.pendingAttachments.map(a => ({ name: a.name })),
    });
  }

  private async handleSaveSettings(settings: { gatewayUrl?: string; apiKey?: string; profile?: string; transport?: string; contextMode?: string; cliPath?: string; sshTarget?: string; sshPort?: string; sshUser?: string; sshKey?: string; hermesHome?: string }) {
    if (!this.chatService) return;

    const cliPath = (settings.cliPath || '').trim();
    const sshTarget = (settings.sshTarget || '').trim();
    const sshPort = (settings.sshPort || '').trim();
    const sshUser = (settings.sshUser || '').trim();
    const sshKey = (settings.sshKey || '').trim();
    const hermesHome = (settings.hermesHome || '').trim();
    this.chatService.setSettings({
      gatewayUrl: (settings.gatewayUrl || '').trim(),
      profile: settings.profile || 'default',
      transport: (settings.transport as any) || 'auto',
      contextMode: (settings.contextMode as any) || 'workspace',
      apiKey: settings.apiKey,
      cliPath,
      sshTarget,
      sshPort,
      sshUser,
      sshKey,
      hermesHome,
    });
    // Keep the Terminal tab in sync with the same SSH connection.
    this.terminalService?.setSshConfig({ host: sshTarget, port: sshPort, user: sshUser, key: sshKey, home: hermesHome });
    console.log('Settings saved (ssh:', sshTarget || '(local)', ', path:', cliPath || '(auto)', ')');

    // Re-resolve hermes: SSH check, manual path, or PATH auto-detect.
    const cliOk = await this.chatService.detectHermesPath();
    if (cliOk && !sshTarget) {
      this.terminalService?.setHermesPath(this.chatService.getHermesPath());
    }

    // Tell the settings panel whether hermes resolved.
    this.view?.webview.postMessage({
      command: 'cliPathStatus',
      // null = pure auto-detect mode (no path and no ssh host)
      valid: (cliPath || sshTarget) ? cliOk : null,
      path: cliOk ? this.chatService.getHermesPath() : '',
      ssh: sshTarget,
    });

    // Re-check the gateway and refresh the overall status.
    const gatewayOk = await this.chatService.checkGateway();
    const usable = cliOk || gatewayOk;
    this.updateChatStatus(usable ? 'ready' : 'no-cli');
    this.updateConnectionStatus(usable ? 'connected' : 'disconnected');
  }

  public sendSettings() {
    if (!this.chatService || !this.view) return;
    const s = this.chatService.getSettings();
    this.view.webview.postMessage({
      command: 'settingsData',
      settings: {
        gatewayUrl: s.gatewayUrl,
        profile: s.profile,
        transport: s.transport,
        contextMode: s.contextMode || 'workspace',
        apiKey: s.apiKey || '',
        cliPath: s.cliPath || '',
        sshTarget: s.sshTarget || '',
        sshPort: s.sshPort || '',
        sshUser: s.sshUser || '',
        sshKey: s.sshKey || '',
        hermesHome: s.hermesHome || '',
      },
    });
  }

  private async handleSelectSshKey() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const defaultUri = home
      ? vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(home), '.ssh').fsPath)
      : undefined;

    const selected = await vscode.window.showOpenDialog({
      title: 'Select SSH private key',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri,
      openLabel: 'Choose key',
    });

    const keyPath = selected?.[0]?.fsPath;
    if (keyPath) {
      this.view?.webview.postMessage({ command: 'sshKeySelected', path: keyPath });
    }
  }

  private async handleRetryLastMessage() {
    if (!this.chatService) return;
    try {
      await this.chatService.retryLastMessage();
    } catch (err) {
      this.view?.webview.postMessage({ command: 'chatError', message: String(err) });
    }
  }

  private async handleRunChatCommand(command: string) {
    if (!this.terminalService) {
      console.error('Terminal service not initialized');
      return;
    }
    const parts = command.trim().split(/\s+/);
    // Strip leading 'hermes' if present
    const cmdParts = parts[0] === 'hermes' ? parts.slice(1) : parts;
    if (cmdParts.length === 0) return;

    try {
      this.terminalService.getOutputChannel().show(true);
      await this.terminalService.executeCommand(cmdParts[0], cmdParts.slice(1));
    } catch (err) {
      console.error(`Failed to execute chat command:`, err);
    }
  }

  private async handleCheckGateway() {
    if (!this.chatService || !this.view) return;
    try {
      const available = await this.chatService.checkGateway();
      this.view.webview.postMessage({
        command: 'gatewayStatus',
        available,
        url: this.chatService.getSettings().gatewayUrl,
      });
    } catch (err) {
      this.view.webview.postMessage({ command: 'gatewayStatus', available: false, error: String(err) });
    }
  }

  private async handleLoadKanban() {
    if (!this.terminalService || !this.view) return;
    try {
      const result = await this.terminalService.executeCommand('kanban', ['list', '--json'], undefined, 15000);
      if (result.exitCode === 0 && result.stdout) {
        this.view.webview.postMessage({ command: 'kanbanData', data: result.stdout });
      } else {
        // Fallback: try without --json
        const fallback = await this.terminalService.executeCommand('kanban', ['list'], undefined, 15000);
        this.view.webview.postMessage({ command: 'kanbanData', data: fallback.stdout || 'No kanban data available.' });
      }
    } catch (err) {
      this.view?.webview.postMessage({ command: 'kanbanData', error: String(err) });
    }
  }

  private async handleLoadSessions() {
    if (!this.chatService || !this.view) return;
    try {
      const sessions = await this.chatService.listSessions();
      this.view.webview.postMessage({ command: 'sessionsData', sessions });
    } catch (err) {
      this.view?.webview.postMessage({ command: 'sessionsData', sessions: [], error: String(err) });
    }
  }

  public updateChatStatus(status: 'ready' | 'no-cli' | 'connecting') {
    this.lastChatStatus = status;
    this.view?.webview.postMessage({ command: 'chatStatus', status });
  }

  public updateConnectionStatus(status: string) {
    this.lastConnectionStatus = status;
    this.view?.webview.postMessage({ command: 'connectionStatus', status });
  }

  public sendChatMessage(data: any) {
    this.view?.webview.postMessage({ command: 'chatMessage', data });
    if (data?.message?.role === 'user') {
      this.sendChatHistory();
    }
  }

  public sendChatStream(data: any) {
    this.view?.webview.postMessage({ command: 'chatStream', data });
  }

  public sendChatComplete(data: any) {
    this.view?.webview.postMessage({ command: 'chatComplete', data });
  }

  public sendChatError(data: any) {
    this.view?.webview.postMessage({ command: 'chatError', data });
  }

  public sendRestoredSession() {
    if (!this.chatService || !this.view) return;
    const activeId = this.chatService.getActiveSessionId();
    if (!activeId) return;
    const msgs = this.chatService.getSessionMessages(activeId);
    if (msgs.length === 0) return;
    const session = this.chatService.getSessions().find(s => s.id === activeId);
    this.view.webview.postMessage({
      command: 'restoreSession',
      sessionId: activeId,
      messages: msgs,
      title: session?.title || 'Hermes Chat',
    });
  }

  public sendChatHistory() {
    if (!this.chatService || !this.view) return;
    const activeId = this.chatService.getActiveSessionId();
    const sessions = this.chatService.getSessions().map((session) => {
      const lastMessage = [...session.messages].reverse().find((m) => m.content && m.content.trim());
      return {
        id: session.id,
        title: session.title || 'New Chat',
        preview: lastMessage?.content || '',
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        active: session.id === activeId,
      };
    });
    this.view.webview.postMessage({ command: 'chatHistoryData', sessions, activeSessionId: activeId });
  }

  private handleOpenChatSession(sessionId?: string) {
    if (!this.chatService || !this.view || !sessionId) return;
    this.chatService.setActiveSession(sessionId);
    const msgs = this.chatService.getSessionMessages(sessionId);
    const session = this.chatService.getSessions().find(s => s.id === sessionId);
    this.view.webview.postMessage({
      command: 'restoreSession',
      sessionId,
      messages: msgs,
      title: session?.title || 'Hermes Chat',
    });
    this.sendChatHistory();
  }

  // --- File navigation handlers ---

  private async handleOpenFile(filePath: string, line?: number, character?: number) {
    if (!this.fileNavigation) return;
    const opened = await this.fileNavigation.openFile(filePath, { line, character, preview: false });
    this.view?.webview.postMessage({ command: 'fileOpenResult', filePath, success: opened });
  }

  private async handleRevealInExplorer(filePath: string) {
    if (!this.fileNavigation) return;
    const revealed = await this.fileNavigation.revealInExplorer(filePath);
    this.view?.webview.postMessage({ command: 'revealResult', filePath, success: revealed });
  }

  private async handleListFiles(filter?: string, limit?: number) {
    if (!this.fileNavigation) return;
    const maxFiles = limit ?? 200;
    const files = await this.fileNavigation.listWorkspaceFiles(undefined, undefined, maxFiles);
    const filtered = filter
      ? files.filter((f) => f.fileName.toLowerCase().includes(filter.toLowerCase()))
      : files;
    const fileData = filtered.map((f) => ({
      fsPath: f.fsPath,
      relativePath: f.relativePath,
      fileName: f.fileName,
      language: f.language,
      size: f.size,
    }));
    this.view?.webview.postMessage({ command: 'workspaceFiles', files: fileData });
  }

  private async handleSearchFiles(query: string, limit?: number) {
    if (!this.fileNavigation) return;
    const files = await this.fileNavigation.searchFiles(query, limit ?? 20);
    this.view?.webview.postMessage({ command: 'searchResults', files: files.map((f) => ({
      fsPath: f.fsPath,
      relativePath: f.relativePath,
      fileName: f.fileName,
      language: f.language,
    })) });
  }

  private handleGetOpenFiles() {
    if (!this.fileNavigation || !this.view) return;
    const files = this.fileNavigation.getOpenFiles();
    const active = this.fileNavigation.getActiveFile();
    this.view.webview.postMessage({
      command: 'openFiles',
      files: files.map((f) => ({
        fsPath: f.fsPath,
        relativePath: f.relativePath,
        fileName: f.fileName,
        language: f.language,
      })),
      activeFile: active
        ? { fsPath: active.fsPath, relativePath: active.relativePath, fileName: active.fileName }
        : null,
    });
  }

  private async handleSwitchEditor(direction: 'next' | 'previous') {
    if (!this.fileNavigation) return;
    await this.fileNavigation.switchEditor(direction);
  }

  private getHtml(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'assets', 'sidebar.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'assets', 'sidebar.js')
    );
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'assets', 'logo-128.png')
    );
    const welcomeLogoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'assets', 'logo-256.png')
    );
    const nonce = getNonce();

    return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'nonce-${nonce}' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${stylesUri}" nonce="${nonce}">
  <title>Hermes Agent</title>
</head>
<body class="theme-${vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark'}">
  <div id="app">
    <header class="sidebar-header">
      <div class="logo">
        <img class="logo-icon" src="${logoUri}" alt="Hermes Agent logo" />
        <h1 class="logo-text">Hermes Agent</h1>
      </div>
      <div id="connection-status" class="status-badge connecting">
        <span class="status-dot"></span>
        <span class="status-text">Initializing...</span>
      </div>
    </header>

    <nav class="sidebar-nav">
      <button class="nav-item active" data-tab="chat" title="Chat with Hermes">
        <span class="nav-icon">&#9993;</span>
        <span class="nav-label">Chat</span>
      </button>
      <button class="nav-item" data-tab="kanban" title="Kanban board">
        <span class="nav-icon">&#9776;</span>
        <span class="nav-label">Kanban</span>
      </button>
      <button class="nav-item" data-tab="terminal" title="Run Hermes CLI commands">
        <span class="nav-icon">&#9608;</span>
        <span class="nav-label">Terminal</span>
      </button>
      <button class="nav-item" data-tab="files" title="Workspace files">
        <span class="nav-icon">&#128193;</span>
        <span class="nav-label">Files</span>
      </button>
      <button class="nav-item" data-tab="sessions" title="Session history">
        <span class="nav-icon">&#8984;</span>
        <span class="nav-label">Sessions</span>
      </button>
      <button class="nav-item" data-tab="settings" title="Settings">
        <span class="nav-icon">&#9881;</span>
        <span class="nav-label">Settings</span>
      </button>
    </nav>

    <main class="sidebar-content">
      <section id="tab-chat" class="tab-content active">
        <div id="chat-welcome" class="chat-welcome">
          <img class="empty-icon welcome-logo" src="${welcomeLogoUri}" alt="Hermes Agent logo" />
          <h2>Hermes Chat</h2>
          <p>Ask questions about your codebase. Hermes has context about your open files and project.</p>
          <div id="chat-status-bar" class="chat-status-bar">
            <span class="status-dot"></span>
            <span id="chat-status-text">Checking Hermes...</span>
          </div>
        </div>
        <div id="chat-area" class="chat-area hidden">
          <div class="chat-header">
            <span class="chat-header-title" id="chat-header-title">Hermes Chat</span>
            <div class="chat-header-actions">
              <button type="button" id="btn-chat-history" class="btn-new-chat" title="Show chat history">History</button>
              <button type="button" id="btn-new-chat" class="btn-new-chat" title="New chat session">+ New</button>
            </div>
          </div>
          <div id="chat-history-panel" class="chat-history-panel hidden">
            <div class="chat-history-header">
              <span>Chat history</span>
              <button type="button" id="btn-refresh-chat-history" class="btn-icon" title="Refresh chat history">&#8635;</button>
            </div>
            <div id="chat-history-list" class="chat-history-list">
              <div class="empty-state compact"><p>No conversations yet.</p></div>
            </div>
          </div>
          <div id="chat-messages" class="chat-messages"></div>
          <div id="chat-input-area" class="chat-input-area">
            <div id="attach-chips" class="attach-chips"></div>
            <form id="chat-form" class="chat-form">
              <textarea
                id="chat-input"
                placeholder="Ask Hermes anything..."
                class="chat-textarea"
                rows="1"
                autocomplete="off"
              ></textarea>
              <button type="submit" id="btn-send" class="btn-send" title="Send">&#9654;</button>
              <button type="button" id="btn-cancel" class="btn-cancel hidden" title="Cancel">&#9585;</button>
            </form>
            <div class="composer-toolbar">
              <button type="button" id="btn-attach" class="composer-btn" title="Attach files">&#128206;</button>
              <select id="composer-profile" class="composer-select" title="Hermes profile">
                <option value="default">default</option>
              </select>
              <select id="composer-model" class="composer-model" title="Model override (-m) — empty uses the profile's model">
                <option value="">model: profile default</option>
              </select>
            </div>
            <div class="chat-hint">Press Enter to send, Shift+Enter for new line</div>
          </div>
        </div>
      </section>

      <section id="tab-kanban" class="tab-content">
        <div class="kanban-header">
          <h3>Kanban Board</h3>
          <button id="btn-refresh-kanban" class="btn-icon" title="Refresh kanban">&#8635;</button>
        </div>
        <div id="kanban-content" class="kanban-content">
          <div class="empty-state">
            <p>Click refresh to load kanban tasks.</p>
          </div>
        </div>
      </section>

      <section id="tab-terminal" class="tab-content">
        <div class="terminal-container">
          <div class="terminal-header">
            <h3>Hermes Terminal</h3>
            <div class="terminal-actions">
              <button id="btn-clear-terminal" class="btn-icon" title="Clear terminal">🗑️</button>
            </div>
          </div>
          <div id="terminal-commands" class="terminal-commands">
            <div class="terminal-command-group">
              <h4>Quick Commands</h4>
              <div class="command-grid">
                <button class="cmd-btn" data-cmd="hermes.status" title="Show Hermes status">
                  <span class="cmd-icon">☢️</span>
                  <span class="cmd-label">Status</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.kanban.list" title="List kanban tasks">
                  <span class="cmd-icon">📋</span>
                  <span class="cmd-label">Kanban</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.sessions" title="List sessions">
                  <span class="cmd-icon">📁</span>
                  <span class="cmd-label">Sessions</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.skills" title="List available skills">
                  <span class="cmd-icon">🧠</span>
                  <span class="cmd-label">Skills</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.cron" title="List cron jobs">
                  <span class="cmd-icon">⏰</span>
                  <span class="cmd-label">Cron</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.logs" title="View recent logs">
                  <span class="cmd-icon">📝</span>
                  <span class="cmd-label">Logs</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.config" title="Show configuration">
                  <span class="cmd-icon">⚙️</span>
                  <span class="cmd-label">Config</span>
                </button>
                <button class="cmd-btn" data-cmd="hermes.version" title="Show Hermes version">
                  <span class="cmd-icon">🏷️</span>
                  <span class="cmd-label">Version</span>
                </button>
              </div>
            </div>
          </div>
          <div id="terminal-output" class="terminal-output"></div>
          <div class="terminal-input-container">
            <span class="terminal-prompt">$</span>
            <input
              id="terminal-input"
              type="text"
              placeholder="Run a Hermes command (e.g. hermes status)..."
              class="terminal-input"
              autocomplete="off"
            />
            <button id="btn-run-command" class="btn-send" title="Run command">▶</button>
          </div>
        </div>
      </section>

      <section id="tab-files" class="tab-content">
        <div class="file-nav-container">
          <div class="file-nav-header">
            <h3>Workspace Files</h3>
            <div class="file-nav-actions">
              <button id="btn-refresh-files" class="btn-icon" title="Refresh file list">&#8635;</button>
              <button id="btn-switch-prev" class="btn-icon" title="Previous file">&#8592;</button>
              <button id="btn-switch-next" class="btn-icon" title="Next file">&#8594;</button>
            </div>
          </div>
          <div class="file-search-container">
            <input
              id="file-search-input"
              type="text"
              placeholder="Search files..."
              class="file-search-input"
              autocomplete="off"
            />
          </div>
          <div id="open-files-bar" class="open-files-bar"></div>
          <div id="file-list" class="file-list">
            <div class="empty-state">
              <p>Loading workspace files...</p>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-sessions" class="tab-content">
        <div class="sessions-header">
          <h3>Session History</h3>
          <button id="btn-refresh-sessions" class="btn-icon" title="Refresh sessions">&#8635;</button>
        </div>
        <div id="sessions-content" class="sessions-content">
          <div class="empty-state">
            <p>Click refresh to load session history.</p>
          </div>
        </div>
      </section>

      <section id="tab-settings" class="tab-content">
        <div class="settings-panel">
          <h2>Settings</h2>
          <div class="settings-section">
            <h3 class="settings-section-title">Remote connection (SSH)</h3>
            <div class="setting-row">
              <div class="setting-group setting-grow">
                <label for="ssh-target">Server</label>
                <input id="ssh-target" type="text" placeholder="SSH host, IP, or alias" class="setting-input" autocomplete="off" />
              </div>
              <div class="setting-group setting-port">
                <label for="ssh-port">Port</label>
                <input id="ssh-port" type="text" placeholder="22" class="setting-input" autocomplete="off" />
              </div>
            </div>
            <div class="setting-group">
              <label for="ssh-user">Username</label>
              <input id="ssh-user" type="text" placeholder="optional — uses ssh config if empty" class="setting-input" autocomplete="off" />
            </div>
            <div class="setting-group">
              <label for="ssh-key">SSH Private Key</label>
              <div class="setting-input-row">
                <input id="ssh-key" type="text" placeholder="Optional private key path" class="setting-input" autocomplete="off" />
                <button id="btn-choose-ssh-key" type="button" class="btn-secondary btn-choose-file">Choose…</button>
              </div>
            </div>
            <div class="setting-group">
              <label for="cli-path">CLI path</label>
              <input id="cli-path" type="text" placeholder="Leave empty to use the CLI from PATH" class="setting-input" autocomplete="off" />
              <div id="cli-path-status" class="gateway-status"></div>
            </div>
            <div class="setting-group">
              <label for="hermes-home">Configuration directory (optional)</label>
              <input id="hermes-home" type="text" placeholder="Optional custom configuration directory" class="setting-input" autocomplete="off" />
            </div>
            <div class="setting-hint">Leave Server empty to run locally. SSH uses key-based authentication. Leave paths empty to use the system defaults.</div>
          </div>
          <div class="setting-group">
            <label for="gateway-url">Gateway URL</label>
            <input id="gateway-url" type="text" placeholder="Optional gateway URL" class="setting-input" />
            <div id="gateway-status" class="gateway-status"></div>
          </div>
          <div class="setting-group">
            <label for="api-key">API Key</label>
            <input id="api-key" type="password" placeholder="Enter API key (optional)" class="setting-input" />
          </div>
          <div class="setting-group">
            <label for="profile">Profile</label>
            <select id="profile" class="setting-input">
              <option value="default">default</option>
            </select>
          </div>
          <div class="setting-group">
            <label for="transport">Transport</label>
            <select id="transport" class="setting-input">
              <option value="auto">Auto (Gateway → CLI fallback)</option>
              <option value="gateway">Gateway only</option>
              <option value="cli">CLI only</option>
            </select>
          </div>
          <div class="setting-group">
            <label for="context-mode">Context access</label>
            <select id="context-mode" class="setting-input">
              <option value="minimal">Minimal — active file and selection only</option>
              <option value="workspace">Workspace — open files, key files, Git, stats</option>
              <option value="full">Full project — include file index and allow workspace reads</option>
            </select>
            <div class="setting-hint">Controls what project context is sent to Hermes. Full project should be used only when you want Hermes to inspect files across the workspace.</div>
          </div>
          <div class="settings-actions">
            <button id="btn-save-settings" class="btn-primary">Save Settings</button>
            <button id="btn-check-gateway" class="btn-secondary">Test Gateway</button>
          </div>
        </div>
      </section>
    </main>

    <footer class="sidebar-footer">
      <span>v0.2.1</span>
      <a href="#" id="btn-open-docs" target="_blank">Docs</a>
    </footer>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
