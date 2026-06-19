import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectContextService } from './projectContext';

export class HermesSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hermesSidebar';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectContext?: ProjectContextService
  ) {}

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
        default:
          console.log(`Unknown message: ${message.command}`);
      }
    });
  }

  public updateStatus(status: 'connected' | 'disconnected' | 'connecting') {
    this.view?.webview.postMessage({ command: 'status', status });
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
        const { command, status } = event.data;
        if (command === 'status') {
          const badge = document.getElementById('connection-status');
          if (badge) {
            badge.className = 'status-badge ' + status;
            const text = badge.querySelector('.status-text');
            const labels = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting...' };
            if (text) text.textContent = labels[status] || status;
          }
        }
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
