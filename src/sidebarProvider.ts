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
          this.handleSendMessage(message.text, message.sessionId);
          break;
        case 'saveSettings':
          this.handleSaveSettings(message.settings);
          break;
        case 'cancelStreaming':
          this.chatService?.cancelStreaming();
          this.view?.webview.postMessage({ command: 'cancelStreaming' });
          break;
        case 'newChatSession': {
          const newId = this.chatService?.newSession() || '';
          this.view?.webview.postMessage({ command: 'newChatSession', sessionId: newId });
          break;
        }
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
      const summary = await this.projectContext.getContextSummary();
      this.view.webview.postMessage({ command: 'projectContext', summary });
    } catch (err) {
      console.error('Failed to get project context:', err);
    }
  }

  // --- Chat handlers ---

  public async handleSendMessage(text: string, sessionId?: string) {
    if (!this.chatService) {
      console.error('Chat service not initialized');
      return;
    }
    try {
      if (sessionId) {
        this.chatService.setActiveSession(sessionId);
      }
      await this.chatService.sendMessage(text);
    } catch (err) {
      console.error('Failed to send chat message:', err);
      this.view?.webview.postMessage({ command: 'chatError', message: String(err) });
    }
  }

  private handleSaveSettings(settings: { gatewayUrl?: string; apiKey?: string; profile?: string }) {
    if (this.chatService) {
      this.chatService.setSettings({
        gatewayUrl: settings.gatewayUrl || 'http://localhost:8080',
        profile: settings.profile || 'default',
      });
    }
    // Save to VS Code global state
    // (could be persisted later)
    console.log('Settings saved:', settings);
  }

  public updateChatStatus(status: 'ready' | 'no-cli' | 'connecting') {
    this.view?.webview.postMessage({ command: 'chatStatus', status });
  }

  public sendChatMessage(data: any) {
    this.view?.webview.postMessage({ command: 'chatMessage', data });
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
    const nonce = getNonce();

    return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${stylesUri}" nonce="${nonce}">
  <title>Hermes Agent</title>
</head>
<body class="theme-${vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark'}">
  <div id="app">
    <header class="sidebar-header">
      <div class="logo">
        <span class="logo-icon">&#9889;</span>
        <h1 class="logo-text">Hermes Agent</h1>
      </div>
      <div id="connection-status" class="status-badge disconnected">
        <span class="status-dot"></span>
        <span class="status-text">Disconnected</span>
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
          <div class="empty-icon">&#9889;</div>
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
            <button type="button" id="btn-new-chat" class="btn-new-chat" title="New chat session">+ New</button>
          </div>
          <div id="chat-messages" class="chat-messages"></div>
          <div id="chat-input-area" class="chat-input-area">
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
            <div class="chat-hint">Press Enter to send, Shift+Enter for new line</div>
          </div>
        </div>
      </section>

      <section id="tab-kanban" class="tab-content">
        <div class="empty-state">
          <div class="empty-icon">&#9776;</div>
          <h2>Kanban Board</h2>
          <p>View and manage your kanban tasks directly from Cursor.</p>
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
        <div class="empty-state">
          <div class="empty-icon">&#8984;</div>
          <h2>Session History</h2>
          <p>Browse and resume previous conversation sessions.</p>
        </div>
      </section>

      <section id="tab-settings" class="tab-content">
        <div class="settings-panel">
          <h2>Settings</h2>
          <div class="setting-group">
            <label for="gateway-url">Gateway URL</label>
            <input id="gateway-url" type="text" placeholder="http://localhost:8080" class="setting-input" />
          </div>
          <div class="setting-group">
            <label for="api-key">API Key</label>
            <input id="api-key" type="password" placeholder="Enter API key" class="setting-input" />
          </div>
          <div class="setting-group">
            <label for="profile">Profile</label>
            <select id="profile" class="setting-input">
              <option value="default">default</option>
            </select>
          </div>
          <button id="btn-save-settings" class="btn-primary">Save Settings</button>
        </div>
      </section>
    </main>

    <footer class="sidebar-footer">
      <span>v0.1.0</span>
      <a href="#" id="btn-open-docs" target="_blank">Docs</a>
    </footer>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscodeApi = acquireVsCodeApi();
      const terminalOutput = document.getElementById('terminal-output');
      const commandOutputs = new Map();

      // Send ready signal
      window.addEventListener('load', () => {
        vscodeApi.postMessage({ command: 'ready' });
      });

      // Navigation tabs
      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          const tabId = 'tab-' + btn.dataset.tab;
          document.getElementById(tabId)?.classList.add('active');
        });
      });

      // Chat state
      let chatInitialized = false;
      let currentStreamingMsgId = null;
      let activeSessionId = null;
      const chatMessages = document.getElementById('chat-messages');
      const chatForm = document.getElementById('chat-form');
      const chatInput = document.getElementById('chat-input');
      const chatArea = document.getElementById('chat-area');
      const chatWelcome = document.getElementById('chat-welcome');
      const btnSend = document.getElementById('btn-send');
      const btnCancel = document.getElementById('btn-cancel');
      const chatStatusBar = document.getElementById('chat-status-bar');
      const chatStatusText = document.getElementById('chat-status-text');
      const chatHeaderTitle = document.getElementById('chat-header-title');

      // Connection status updates from extension
      window.addEventListener('message', event => {
        const { command, status, data } = event.data;
        if (command === 'status') {
          const badge = document.getElementById('connection-status');
          if (badge) {
            badge.className = 'status-badge ' + status;
            const text = badge.querySelector('.status-text');
            const labels = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting...' };
            if (text) text.textContent = labels[status] || status;
          }
        }
        if (command === 'terminalOutput') {
          appendTerminalOutput(data);
        }
        if (command === 'clearTerminal') {
          terminalOutput.innerHTML = '';
          commandOutputs.clear();
        }
        if (command === 'workspaceFiles') {
          renderFileList(data.files);
        }
        if (command === 'searchResults') {
          renderFileList(data.files);
        }
        if (command === 'openFiles') {
          renderOpenFilesBar(data.files, data.activeFile);
        }
        // Chat status (ready / no-cli)
        if (command === 'chatStatus') {
          initChatArea(status);
        }
        // Chat message (user or assistant)
        if (command === 'chatMessage') {
          appendChatMessage(data.message);
        }
        // Streaming update
        if (command === 'chatStream') {
          updateStreamingMessage(data.messageId, data.content);
        }
        // Chat complete
        if (command === 'chatComplete') {
          finishStreamingMessage();
        }
        // Chat error
        if (command === 'chatError') {
          showChatError(data.message || data.error || 'Unknown error');
        }
        // Cancel streaming
        if (command === 'cancelStreaming') {
          finishStreamingMessage();
          setStreamingState(false);
        }
        // New chat session from backend
        if (command === 'newChatSession') {
          resetChatUI();
          activeSessionId = data?.sessionId || null;
          if (chatHeaderTitle) chatHeaderTitle.textContent = 'Hermes Chat';
        }
        // Restore persisted session on webview ready
        if (command === 'restoreSession') {
          activeSessionId = data.sessionId;
          if (chatHeaderTitle) chatHeaderTitle.textContent = data.title || 'Hermes Chat';
          // Show chat area, hide welcome
          if (chatArea) chatArea.classList.remove('hidden');
          if (chatWelcome) chatWelcome.classList.add('hidden');
          chatInitialized = true;
          // Render all messages
          if (chatMessages) chatMessages.innerHTML = '';
          for (const msg of (data.messages || [])) {
            appendChatMessage(msg);
          }
        }
      });

      // Initialize chat area when Hermes CLI is detected
      function initChatArea(status) {
        if (chatInitialized) return;
        chatInitialized = true;

        if (status === 'ready') {
          // Show chat area, hide welcome
          if (chatArea) chatArea.classList.remove('hidden');
          if (chatWelcome) chatWelcome.classList.add('hidden');
          if (chatStatusText) {
            chatStatusText.textContent = 'Hermes ready';
          }
          if (chatStatusBar) {
            chatStatusBar.classList.add('ready');
          }
        } else {
          // CLI not found
          if (chatStatusText) {
            chatStatusText.textContent = 'Hermes CLI not found in PATH';
          }
          if (chatStatusBar) {
            chatStatusBar.classList.add('error');
          }
        }
      }

      // Append a chat message bubble
      function appendChatMessage(msg) {
        if (!chatMessages) return;
        // Auto-show chat area on first message
        if (chatArea && chatArea.classList.contains('hidden')) {
          chatArea.classList.remove('hidden');
          if (chatWelcome) chatWelcome.classList.add('hidden');
        }

        // Update header title on first user message
        if (msg.role === 'user' && !activeSessionId) {
          updateChatTitle(msg.content);
        }

        const div = document.createElement('div');
        div.className = 'chat-bubble ' + (msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant');
        div.dataset.msgId = msg.id;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-bubble-content';
        contentDiv.innerHTML = formatMessageContent(msg.content, msg.role);
        div.appendChild(contentDiv);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'chat-bubble-time';
        timeDiv.textContent = formatTime(msg.timestamp);
        div.appendChild(timeDiv);

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (msg.role === 'assistant' && msg.streaming) {
          currentStreamingMsgId = msg.id;
        }
      }

      // Update streaming content
      function updateStreamingMessage(msgId, content) {
        var sel = '[data-msg-id="' + msgId + '"] .chat-bubble-content';
        const el = chatMessages?.querySelector(sel);
        if (el) {
          el.innerHTML = formatMessageContent(content, 'assistant');
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }

      // Finish streaming
      function finishStreamingMessage() {
        if (currentStreamingMsgId) {
          const sel2 = '[data-msg-id="' + currentStreamingMsgId + '"]';
          const el = chatMessages?.querySelector(sel2);
          if (el) {
            el.classList.remove('streaming');
          }
          currentStreamingMsgId = null;
        }
        setStreamingState(false);
      }

      // Show error message in chat
      function showChatError(errorText) {
        if (!chatMessages) return;
        const div = document.createElement('div');
        div.className = 'chat-bubble chat-bubble-error';
        div.innerHTML =
          '<div class="chat-bubble-content">&#9888; ' + escapeHtml(errorText) + '</div>';
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        setStreamingState(false);
      }

      // Reset chat UI for new session
      function resetChatUI() {
        if (chatMessages) chatMessages.innerHTML = '';
        currentStreamingMsgId = null;
        setStreamingState(false);
        if (chatInput) { chatInput.disabled = false; chatInput.value = ''; chatInput.placeholder = 'Ask Hermes anything...'; }
        if (chatInput) chatInput.style.height = 'auto';
      }

      // Update chat header title from first user message
      function updateChatTitle(text) {
        if (!chatHeaderTitle) return;
        const preview = text.slice(0, 40);
        chatHeaderTitle.textContent = preview + (text.length > 40 ? '...' : '');
      }

      // Format message content (support markdown-ish code blocks)
      function formatMessageContent(text, role) {
        if (!text) return '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
        let html = escapeHtml(text);
        // Basic code block formatting — use string concat to avoid backtick issues
        var bt3 = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
        html = html.replace(new RegExp(bt3 + '(\\w*)\\n([\\s\\S]*?)' + bt3, 'g'), '<code class="code-block"><pre>$2</pre></code>');
        // Inline code
        var bt = String.fromCharCode(96);
        html = html.replace(new RegExp(bt + '([^' + bt + ']+)' + bt, 'g'), '<code class="inline-code">$1</code>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        return html;
      }

      // Format timestamp
      function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      // Set streaming UI state (buttons, input)
      function setStreamingState(isStreaming) {
        if (isStreaming) {
          if (btnSend) btnSend.classList.add('hidden');
          if (btnCancel) btnCancel.classList.remove('hidden');
          if (chatInput) { chatInput.disabled = true; chatInput.placeholder = 'Hermes is thinking...'; }
        } else {
          if (btnSend) btnSend.classList.remove('hidden');
          if (btnCancel) btnCancel.classList.add('hidden');
          if (chatInput) { chatInput.disabled = false; chatInput.placeholder = 'Ask Hermes anything...'; }
        }
      }

      // Connect button (removed — auto-connects now)
      document.getElementById('btn-connect')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'connect' });
      });

      // Chat form — send message
      if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!chatInput) return;
          const text = chatInput.value.trim();
          if (!text) return;

          chatInput.value = '';
          chatInput.style.height = 'auto';
          vscodeApi.postMessage({ command: 'sendMessage', text, sessionId: activeSessionId });
          setStreamingState(true);
          // Track that we have an active session now
          if (!activeSessionId) {
            updateChatTitle(text);
          }
        });
      }

      // New chat button
      document.getElementById('btn-new-chat')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'newChatSession' });
      });

      // Cancel streaming button
      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          vscodeApi.postMessage({ command: 'cancelStreaming' });
        });
      }

      // Auto-resize textarea
      if (chatInput) {
        chatInput.addEventListener('input', () => {
          chatInput.style.height = 'auto';
          chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        });
        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm?.requestSubmit();
          }
        });
      }

      // Quick command buttons
      document.querySelectorAll('.cmd-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmdId = btn.dataset.cmd;
          btn.classList.add('running');
          vscodeApi.postMessage({ command: 'executeCommand', commandId: cmdId, args: [] });

          // Create output block for this command
          const cmdTitle = btn.querySelector('.cmd-label')?.textContent || cmdId;
          addCommandBlock(cmdId, cmdTitle);
        });
      });

      // Custom command input
      const terminalInput = document.getElementById('terminal-input');
      const runBtn = document.getElementById('btn-run-command');

      if (runBtn) {
        runBtn.addEventListener('click', () => {
          if (terminalInput && terminalInput.value.trim()) {
            vscodeApi.postMessage({ command: 'executeCustomCommand', input: terminalInput.value.trim() });
            const inputVal = terminalInput.value.trim();
            addCommandBlock('custom_' + Date.now(), inputVal);
            terminalInput.value = '';
          }
        });
      }

      if (terminalInput) {
        terminalInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && terminalInput.value.trim()) {
            e.preventDefault();
            vscodeApi.postMessage({ command: 'executeCustomCommand', input: terminalInput.value.trim() });
            const inputVal = terminalInput.value.trim();
            addCommandBlock('custom_' + Date.now(), inputVal);
            terminalInput.value = '';
          }
        });
      }

      // Clear terminal button
      document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'clearTerminal' });
      });

      // Connect button
      document.getElementById('btn-connect')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'connect' });
      });

      // Save settings
      document.getElementById('btn-save-settings')?.addEventListener('click', () => {
        const gatewayUrl = document.getElementById('gateway-url').value;
        const apiKey = document.getElementById('api-key').value;
        const profile = document.getElementById('profile').value;
        vscodeApi.postMessage({
          command: 'saveSettings',
          settings: { gatewayUrl, apiKey, profile }
        });
      });

      // Terminal helper functions
      function addCommandBlock(id, title) {
        const block = document.createElement('div');
        block.className = 'command-block';
        block.id = 'cmd-' + id;
        block.innerHTML =
          '<div class="command-header">' +
            '<span class="command-title">$ ' + escapeHtml(title) + '</span>' +
            '<span class="command-status running">\u23F3 Running...</span>' +
          '</div>' +
          '<pre class="command-output"></pre>';
        terminalOutput.appendChild(block);
        commandOutputs.set(id, block);
        block.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }

      function appendTerminalOutput(data) {
        let block = commandOutputs.get(data.id);
        if (!block) {
          addCommandBlock(data.id, data.command || 'command');
          block = commandOutputs.get(data.id);
        }

        if (block) {
          const output = block.querySelector('.command-output');
          const status = block.querySelector('.command-status');

          if (data.text) {
            if (output) {
              output.textContent += data.text;
            }
          }

          if (data.exitCode !== undefined) {
            if (status) {
              status.className = 'command-status ' + (data.exitCode === 0 ? 'success' : 'error');
              status.textContent = data.exitCode === 0
                ? '✓ Done (' + data.duration + 'ms)'
                : '✗ Failed (code ' + data.exitCode + ')';
            }
          }

          block.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }

      // File navigation UI handlers
      const fileList = document.getElementById('file-list');
      const fileSearchInput = document.getElementById('file-search-input');
      const openFilesBar = document.getElementById('open-files-bar');

      // Refresh files button
      document.getElementById('btn-refresh-files')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'listFiles' });
      });

      // Switch editor buttons
      document.getElementById('btn-switch-prev')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'switchEditor', direction: 'previous' });
      });
      document.getElementById('btn-switch-next')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'switchEditor', direction: 'next' });
      });

      // Search files input with debounce
      let searchTimeout: any = null;
      if (fileSearchInput) {
        fileSearchInput.addEventListener('input', () => {
          clearTimeout(searchTimeout);
          const query = fileSearchInput.value.trim();
          if (query.length === 0) {
            vscodeApi.postMessage({ command: 'listFiles' });
            return;
          }
          searchTimeout = setTimeout(() => {
            vscodeApi.postMessage({ command: 'searchFiles', query, limit: 20 });
          }, 300);
        });
      }

      // Load files when tab becomes active
      document.querySelector('[data-tab="files"]')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'listFiles' });
        vscodeApi.postMessage({ command: 'getOpenFiles' });
      });

      // File rendering functions
      function renderFileList(files) {
        if (!fileList) return;
        if (files.length === 0) {
          fileList.innerHTML = '<div class="empty-state"><p>No files found.</p></div>';
          return;
        }
        fileList.innerHTML = '';
        for (const f of files) {
          const item = document.createElement('div');
          item.className = 'file-item';
          const icon = getFileIcon(f.fileName);
          item.innerHTML =
            '<span class="file-icon">' + icon + '</span>' +
            '<span class="file-name">' + escapeHtml(f.fileName) + '</span>' +
            '<span class="file-path">' + escapeHtml(f.relativePath) + '</span>' +
            '<span class="file-language">' + escapeHtml(f.language || '') + '</span>';
          item.addEventListener('click', () => {
            vscodeApi.postMessage({ command: 'openFile', filePath: f.fsPath });
          });
          item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            vscodeApi.postMessage({ command: 'revealInExplorer', filePath: f.fsPath });
          });
          fileList.appendChild(item);
        }
      }

      function renderOpenFilesBar(files, activeFile) {
        if (!openFilesBar) return;
        if (files.length === 0) {
          openFilesBar.innerHTML = '';
          return;
        }
        openFilesBar.innerHTML = '';
        for (const f of files) {
          const tab = document.createElement('button');
          tab.className = 'file-tab' + (activeFile && activeFile.fsPath === f.fsPath ? ' active' : '');
          tab.textContent = f.fileName;
          tab.title = f.relativePath;
          tab.addEventListener('click', () => {
            vscodeApi.postMessage({ command: 'openFile', filePath: f.fsPath });
          });
          openFilesBar.appendChild(tab);
        }
      }

      function getFileIcon(fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const icons: Record<string, string> = {
          ts: 'TS', tsx: '⚛', js: 'JS', jsx: '⚛', py: '🐍',
          json: '📋', md: '📝', css: '🎨', html: '🌐', yaml: '⚙',
          yml: '⚙', toml: '⚙', sh: '⚡', dockerfile: '🐳',
          git: '📦', lock: '🔒', env: '🔑', sql: '🗄',
        };
        return icons[ext] || '📄';
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    })();
  </script>
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
