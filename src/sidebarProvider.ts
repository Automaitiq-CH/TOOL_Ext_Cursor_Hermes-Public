import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectContextService } from './projectContext';
import { TerminalService } from './terminalService';

export class HermesSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hermesSidebar';
  private view?: vscode.WebviewView;
  private terminalService?: TerminalService;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectContext?: ProjectContextService
  ) {}

  public setTerminalService(service: TerminalService) {
    this.terminalService = service;
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
        <div class="empty-state">
          <div class="empty-icon">&#9889;</div>
          <h2>Welcome to Hermes</h2>
          <p>Connect to your Hermes gateway to start chatting, managing tasks, and running skills from Cursor.</p>
          <button id="btn-connect" class="btn-primary">Connect Gateway</button>
        </div>
        <div id="chat-area" class="chat-area hidden">
          <div id="chat-messages" class="chat-messages"></div>
          <form id="chat-form" class="chat-form">
            <input
              id="chat-input"
              type="text"
              placeholder="Ask Hermes anything..."
              class="chat-input"
              autocomplete="off"
            />
            <button type="submit" class="btn-send" title="Send">&#9654;</button>
          </form>
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
      });

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

      // Chat form
      document.getElementById('chat-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        if (input && input.value.trim()) {
          vscodeApi.postMessage({ command: 'sendMessage', text: input.value.trim() });
          input.value = '';
        }
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
