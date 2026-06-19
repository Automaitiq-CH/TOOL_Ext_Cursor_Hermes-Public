# Hermes Cursor Extension — MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a VS Code / Cursor native extension that connects to the Hermes AI Agent gateway, providing chat, terminal integration, kanban board display, and file navigation directly inside the IDE.

**Architecture:** Thin client extension (~2K LOC TypeScript). Extension communicates with Hermes via HTTP/SSE to the local gateway (`localhost:21421`). No bundler, no Electron shell — just VS Code extension host + webview panels.

**Tech Stack:** TypeScript, VS Code Extension API v1.86+, Webview API, `@vscode/webview-ui-toolkit`, native fetch/SSE, Hermes REST API.

**Approach validated:** Spike 003 (native from scratch) — 2-3x cheaper than forking Cline, full access to Hermes features, ~2K LOC TypeScript, MVP in 22 days.

---

## Dependency graph

```
Task 001 (Project setup)
    └── 002 (Extension activation)
        └── 003 (Configuration)
            ├── 004 (API client)
            │   ├── 005 (Chat - core)
            │   │   ├── 006 (Chat - streaming)
            │   │   └── 007 (Chat - context)
            │   └── 008 (Terminal)
            └── 009 (Kanban)
                └── 010 (File navigation)
```

Linear critical path: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010

---

## Phase 1: Foundation (Tasks 001-004)

### Task 001: Project scaffolding — tsconfig, ESLint, .gitignore

**Objective:** Set up TypeScript compilation config, linting, and git ignore so the project compiles from `npm run compile`.

**Files:**
- Create: `tsconfig.json`
- Create: `.eslintrc.json`
- Create: `.gitignore`
- Create: `src/extension.ts` (stub)
- Modify: `package.json` (already exists, verify scripts)

**Step 1: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "outDir": "out",
    "lib": ["ES2022"],
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": "src"
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

**Step 2: Write .eslintrc.json**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "ignorePatterns": ["out/", "node_modules/", ".vscode-test/"]
}
```

**Step 3: Write .gitignore**

```
node_modules/
out/
*.vsix
.DS_Store
.env
.env.local
```

**Step 4: Write stub extension.ts**

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Hermes extension activated');
}

export function deactivate() {}
```

**Step 5: Compile and verify**

```bash
npm install
npm run compile
```

Expected: `out/extension.js` generated, no errors.

**Step 6: Commit**

```bash
git add .
git commit -m "feat: project scaffolding — tsconfig, eslint, stub extension"
```

---

### Task 002: Extension activation — register commands and sidebar webview

**Objective:** Extension activates, registers the 3 commands from package.json, and shows a sidebar webview with the Hermes icon.

**Files:**
- Modify: `src/extension.ts`
- Create: `src/webview/session.html` (static stub)
- Create: `assets/hermes-icon.svg`

**Step 1: Create SVG icon**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 2.2L12.5 6 8 8.8 3.5 6 8 3.2zM2 7.2l6 3.6v3.4L2 11.2V7.2zm8 7v-3.4l6-3.6v4L10 14.2z"/>
</svg>
```

**Step 2: Create stub webview HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Hermes</title>
  <style>
    body { margin: 0; padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
    .placeholder { text-align: center; padding: 40px 0; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="placeholder">Hermes AI Agent</div>
</body>
</html>
```

**Step 3: Implement extension activation with webview + commands**

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Sidebar webview
  const panel = vscode.window.createWebviewPanel(
    'hermes.session',
    'Hermes',
    vscode.ViewColumn.Beside,
    { enableScripts: false, localResourceRoots: [context.extensionUri] }
  );
  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('hermesExtension.startSession', () => {
      vscode.window.showInformationMessage('Hermes session started');
    }),
    vscode.commands.registerCommand('hermesExtension.askAgent', () => {
      vscode.window.showInputBox({ placeHolder: 'Ask Hermes...' }).then(input => {
        if (input) vscode.window.showInformationMessage(`Query: ${input}`);
      });
    }),
    vscode.commands.registerCommand('hermesExtension.showKanban', () => {
      vscode.window.showInformationMessage('Kanban board coming soon');
    })
  );
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const htmlPath = vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'session.html');
  const html = require('fs').readFileSync(vscode.Uri.parse(htmlPath.fsPath).fsPath, 'utf-8');
  return html.replace(/{{nonce}}/g, webview.cspSource);
}

export function deactivate() {}
```

**Step 4: Compile and test activation**

```bash
npm run compile
code --extensionDevelopmentPath=/Users/mmserver/NXTCloud/AI/Pro/Automaitiq/TOOL_Ext_Cursor_Hermes .
```

Expected: Extension shows in VS Code, sidebar icon visible, commands appear in palette.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: extension activation — sidebar webview + 3 commands registered"
```

---

### Task 003: Configuration management — read settings from VS Code

**Objective:** Read `hermes.apiUrl`, `hermes.apiKey`, `hermes.model` from VS Code settings with sensible defaults.

**Files:**
- Create: `src/config.ts`
- Modify: `src/extension.ts` (use config)

**Step 1: Write config module**

```typescript
import * as vscode from 'vscode';

export interface HermesConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export function getConfig(): HermesConfig {
  const config = vscode.workspace.getConfiguration('hermes');
  return {
    apiUrl: config.get<string>('apiUrl', 'http://localhost:21421')!,
    apiKey: config.get<string>('apiKey', '')!,
    model: config.get<string>('model', '')!,
  };
}

export function watchConfig(onChange: (config: HermesConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('hermes')) {
      onChange(getConfig());
    }
  });
}
```

**Step 2: Integrate into extension.ts**

Replace the stub commands to use config:

```typescript
import { getConfig } from './config';

export function activate(context: vscode.ExtensionContext) {
  const config = getConfig();
  console.log(`Hermes extension activated — connecting to ${config.apiUrl}`);

  context.subscriptions.push(
    watchConfig(newConfig => {
      console.log(`Hermes config updated: ${newConfig.apiUrl}`);
    })
  );
  // ... existing commands + webview
}
```

**Step 3: Write unit test**

Create: `tests/config.test.ts`

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Config Tests', () => {
  test('default config values', async () => {
    const config = vscode.workspace.getConfiguration('hermes');
    const apiUrl = config.get<string>('apiUrl', 'http://localhost:21421');
    assert.strictEqual(apiUrl, 'http://localhost:21421');
  });
});
```

**Step 4: Compile and run test**

```bash
npm run compile
npm test
```

Expected: Test passes, config reads defaults correctly.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: configuration module — read hermes settings with defaults"
```

---

### Task 004: Hermes API client — REST communication layer

**Objective:** HTTP client that talks to the Hermes gateway API for chat sessions and kanban queries.

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/types.ts`

**Step 1: Write API types**

```typescript
export interface ChatRequest {
  message: string;
  context?: string;
  model?: string;
  threadId?: string;
}

export interface ChatResponse {
  threadId: string;
  message: string;
  done: boolean;
}

export interface KanbanTask {
  id: string;
  title: string;
  status: string;
  assignee?: string;
  priority?: number;
}

export interface KanbanBoard {
  tasks: KanbanTask[];
  columns: string[];
}

export interface HermesError {
  error: string;
  code?: string;
}
```

**Step 2: Write API client**

```typescript
import * as vscode from 'vscode';
import { HermesConfig } from '../config';
import { ChatRequest, ChatResponse, KanbanBoard, HermesError } from './types';

export class HermesApiClient {
  private config: HermesConfig;

  constructor(config: HermesConfig) {
    this.config = config;
  }

  updateConfig(config: HermesConfig) {
    this.config = config;
  }

  private async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    const res = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = (await res.json()) as HermesError;
      throw new Error(`Hermes API ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async get<T>(endpoint: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    const res = await fetch(`${this.config.apiUrl}${endpoint}`, { headers });
    if (!res.ok) {
      const err = (await res.json()) as HermesError;
      throw new Error(`Hermes API ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async sendChat(request: ChatRequest): Promise<ChatResponse> {
    return this.post<ChatResponse>('/v1/chat', request);
  }

  async getKanbanBoard(board?: string): Promise<KanbanBoard> {
    const path = board ? `/v1/kanban/${board}` : '/v1/kanban';
    return this.get<KanbanBoard>(path);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const ok = await this.get<Record<string, unknown>>('/health');
      return !!ok;
    } catch {
      return false;
    }
  }
}
```

**Step 3: Wire into extension**

In `extension.ts`:

```typescript
import { HermesApiClient } from './api/client';

let apiClient: HermesApiClient;

export function activate(context: vscode.ExtensionContext) {
  const config = getConfig();
  apiClient = new HermesApiClient(config);

  // Check connection on startup
  apiClient.healthCheck().then(ok => {
    if (!ok) {
      vscode.window.showWarningMessage('Hermes gateway not reachable at ' + config.apiUrl);
    }
  });

  context.subscriptions.push(
    watchConfig(newConfig => {
      apiClient.updateConfig(newConfig);
    })
  );
  // ... existing
}
```

**Step 4: Compile and verify**

```bash
npm run compile
```

Expected: Compiles cleanly. `fetch` is available in VS Code extension host (Node 20+).

**Step 5: Commit**

```bash
git add .
git commit -m "feat: Hermes API client — chat, kanban, health endpoints"
```

---

## Phase 2: Chat (Tasks 005-007)

### Task 005: Chat panel — basic request/response in webview

**Objective:** User types a message in the webview chat input, receives a response from Hermes displayed in the chat history.

**Files:**
- Create: `src/webview/chat.html`
- Create: `src/webview/chat.js` (webview-side script)
- Create: `src/providers/chat-provider.ts`
- Modify: `src/extension.ts`

**Step 1: Chat webview provider**

```typescript
import * as vscode from 'vscode';
import { HermesApiClient } from '../api/client';
import { getConfig } from '../config';

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private apiClient: HermesApiClient) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; message?: string }) => {
      if (msg.type === 'chat' && msg.message) {
        webviewView.webview.postMessage({ type: 'typing' });
        try {
          const response = await this.apiClient.sendChat({
            message: msg.message,
            model: getConfig().model || undefined,
          });
          webviewView.webview.postMessage({ type: 'response', data: response });
        } catch (err: any) {
          webviewView.webview.postMessage({ type: 'error', error: err.message });
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptPath = vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'chat.js');
    const scriptUri = webview.asWebviewUri(scriptPath);
    return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
  <style>
    body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); height: 100vh; display: flex; flex-direction: column; }
    #chat-history { flex: 1; overflow-y: auto; padding: 8px; }
    .msg { margin: 4px 0; padding: 8px; border-radius: 4px; }
    .msg.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .msg.assistant { background: var(--vscode-editor-background); }
    .msg.error { background: var(--vscode-inputValidation-errorBackground); }
    #input-area { display: flex; gap: 4px; padding: 8px 0 0; }
    #input { flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    #send { padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
    #send:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div id="chat-history"></div>
  <div id="input-area">
    <input id="input" placeholder="Ask Hermes..." />
    <button id="send">Send</button>
  </div>
  <script type="module">
    const vscode = acquireVsCodeApi();
    const history = document.getElementById('chat-history');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    send.addEventListener('click', () => { const m = input.value.trim(); if (m) { vscode.postMessage({type:'chat',message:m}); input.value=''; send.disabled=true; addMsg('user',m); } });
    input.addEventListener('keydown', e => { if (e.key==='Enter') send.click(); });
    window.addEventListener('message', e => {
      const {type,data,error} = e.data;
      if (type==='typing') addMsg('assistant','Thinking...');
      if (type==='response') { addMsg('assistant',data.message); send.disabled=false; }
      if (type==='error') { addMsg('error','Error: '+error); send.disabled=false; }
    });
    function addMsg(role, text) { const d = document.createElement('div'); d.className='msg '+role; d.textContent=text; history.appendChild(d); history.scrollTop=history.scrollHeight; }
  </script>
</body>
</html>`;
  }
}
```

**Step 2: Register in extension.ts**

```typescript
import { ChatWebviewProvider } from './providers/chat-provider';

export function activate(context: vscode.ExtensionContext) {
  // ... existing setup
  const chatProvider = new ChatWebviewProvider(context.extensionUri, apiClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hermes.session', chatProvider)
  );
}
```

**Step 3: Update package.json views**

Change the webview view ID to match:

```json
"views": {
  "hermes": [
    {
      "type": "webview",
      "id": "hermes.session",
      "name": "Chat"
    }
  ]
}
```

**Step 4: Compile and test**

```bash
npm run compile
code --extensionDevelopmentPath=. .
```

Expected: Sidebar shows chat panel, typing a message sends to Hermes, response appears.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: chat panel — webview with request/response to Hermes API"
```

---

### Task 006: Chat streaming — SSE-based token streaming

**Objective:** Stream LLM responses token-by-token instead of waiting for the full response, using Server-Sent Events from the Hermes gateway.

**Files:**
- Modify: `src/api/client.ts` (add SSE endpoint)
- Modify: `src/providers/chat-provider.ts` (handle streaming)

**Step 1: Add SSE streaming to API client**

```typescript
export class HermesApiClient {
  // ... existing methods

  async *streamChat(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    const res = await fetch(`${this.config.apiUrl}/v1/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) yield parsed.content;
          } catch { /* skip non-JSON chunks */ }
        }
      }
    }
  }
}
```

**Step 2: Update chat provider for streaming**

In `resolveWebviewView`, replace the message handler:

```typescript
webviewView.webview.onDidReceiveMessage(async (msg: { type: string; message?: string }) => {
  if (msg.type !== 'chat' || !msg.message) return;

  const typingEl = addPlaceholder(webviewView);
  webviewView.webview.postMessage({ type: 'user_msg', data: msg.message });
  send.disabled = true;

  try {
    let fullResponse = '';
    for await (const token of this.apiClient.streamChat({
      message: msg.message,
      model: getConfig().model || undefined,
    })) {
      fullResponse += token;
      webviewView.webview.postMessage({ type: 'stream_token', data: token });
    }
    removePlaceholder(typingEl);
    webviewView.webview.postMessage({ type: 'stream_done', data: fullResponse });
  } catch (err: any) {
    webviewView.webview.postMessage({ type: 'error', error: err.message });
  }
  send.disabled = false;
});
```

**Step 3: Update webview script to handle streaming**

In the inline script of `getHtml()`:

```javascript
let currentAssistantMsg = null;
window.addEventListener('message', e => {
  const { type, data, error } = e.data;
  if (type === 'user_msg') { addMsg('user', data); }
  if (type === 'stream_token') {
    if (!currentAssistantMsg) { currentAssistantMsg = addMsg('assistant', ''); }
    currentAssistantMsg.textContent += data;
    history.scrollTop = history.scrollHeight;
  }
  if (type === 'stream_done') { currentAssistantMsg = null; }
  if (type === 'error') { addMsg('error', 'Error: ' + error); currentAssistantMsg = null; }
});
```

**Step 4: Compile and verify**

```bash
npm run compile
```

Expected: Compiles cleanly. Streaming works when Hermes gateway supports `/v1/chat/stream`.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: chat streaming — SSE token-by-token response display"
```

---

### Task 007: Chat with project context — inject current file + selection

**Objective:** When the user sends a message, automatically include the currently open file content and any selected text as context for Hermes.

**Files:**
- Modify: `src/providers/chat-provider.ts`
- Modify: `src/api/types.ts` (extend ChatRequest)

**Step 1: Extend API types**

```typescript
export interface ChatRequest {
  message: string;
  context?: string;
  model?: string;
  threadId?: string;
  files?: FileContext[];
  selection?: SelectionContext;
}

export interface FileContext {
  path: string;
  name: string;
  content: string;
}

export interface SelectionContext {
  path: string;
  text: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}
```

**Step 2: Add context injection to chat provider**

```typescript
import { getCurrentFileContext, getSelectionContext } from '../utils/context';

// In the message handler:
const fileContext = getCurrentFileContext();
const selection = getSelectionContext();

const response = await this.apiClient.sendChat({
  message: msg.message,
  model: getConfig().model || undefined,
  files: fileContext,
  selection,
});
```

**Step 3: Write context utility**

Create: `src/utils/context.ts`

```typescript
import * as vscode from 'vscode';

export function getCurrentFileContext(): { path: string; name: string; content: string }[] {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return [];
  return [{
    path: editor.document.fileName,
    name: vscode.path.basename(editor.document.fileName),
    content: editor.document.getText(),
  }];
}

export function getSelectionContext(): { path: string; text: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return null;
  return {
    path: editor.document.fileName,
    text: editor.document.getText(editor.selection),
    range: {
      start: { line: editor.selection.start.line, character: editor.selection.start.character },
      end: { line: editor.selection.end.line, character: editor.selection.end.character },
    },
  };
}

export function getProjectStructure(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!root) return '';
  // Simple recursive walk — first 3 levels only
  return walkDirectory(root, 0, 3);
}

function walkDirectory(dir: string, depth: number, maxDepth: number): string {
  if (depth >= maxDepth) return '';
  const fs = require('fs');
  const path = require('path');
  let result = '';
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const indent = '  '.repeat(depth);
      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/\n`;
        result += walkDirectory(path.join(dir, entry.name), depth + 1, maxDepth);
      } else {
        result += `${indent}${entry.name}\n`;
      }
    }
  } catch { /* permission denied or not a dir */ }
  return result;
}
```

**Step 4: Compile and verify**

```bash
npm run compile
```

Expected: Compiles cleanly. Context utility reads active editor state.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: project context — inject active file + selection into chat"
```

---

## Phase 3: Terminal Integration (Task 008)

### Task 008: Terminal integration — Hermes commands in VS Code integrated terminal

**Objective:** Run Hermes commands directly from the VS Code terminal. The extension provides a terminal link provider so Hermes URLs/commands in terminal output are clickable.

**Files:**
- Create: `src/providers/terminal-link-provider.ts`
- Create: `src/providers/terminal-command.ts`
- Modify: `src/extension.ts`

**Step 1: Terminal link provider**

```typescript
import * as vscode from 'vscode';

export class HermesTerminalLinkProvider implements vscode.TerminalLinkProvider {
  private static readonly HERMES_URL_RE = /(?:hermes:\/\/|hermes-)([a-zA-Z0-9_-]+)/g;

  async provideTerminalLinks(context: vscode.TerminalLinkContext, _token: vscode.CancellationToken): Promise<vscode.TerminalLink[]> {
    const links: vscode.TerminalLink[] = [];
    let match;
    while ((match = HermesTerminalLinkProvider.HERMES_URL_RE.exec(context.line)) !== null) {
      links.push({
        startIndex: match.index,
        length: match[0].length,
        tooltip: 'Open in Hermes',
        path: match[1],
      });
    }
    return links;
  }

  async handleTerminalLink(link: vscode.TerminalLink) {
    vscode.commands.executeCommand('hermesExtension.askAgent', link.path);
  }
}
```

**Step 2: Terminal command execution**

```typescript
import * as vscode from 'vscode';
import { HermesApiClient } from '../api/client';

export async function runHermesCommand(apiClient: HermesApiClient, command: string) {
  const terminal = vscode.window.createTerminal({ name: 'Hermes', cwd: vscode.workspace.workspaceFolders?.[0]?.uri });
  terminal.show();

  // Send command to Hermes API for execution
  try {
    const result = await apiClient.post<any>('/v1/execute', { command });
    terminal.sendText(result.output || result);
  } catch (err: any) {
    terminal.sendText(`Error: ${err.message}`);
  }
}
```

**Step 3: Register in extension.ts**

```typescript
import { HermesTerminalLinkProvider } from './providers/terminal-link-provider';

export function activate(context: vscode.ExtensionContext) {
  // ... existing
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(new HermesTerminalLinkProvider())
  );
}
```

**Step 4: Add command to package.json**

```json
{
  "command": "hermesExtension.runTerminalCommand",
  "title": "Hermes: Run in Terminal"
}
```

**Step 5: Compile and verify**

```bash
npm run compile
```

Expected: Terminal links detectable, command execution available via palette.

**Step 6: Commit**

```bash
git add .
git commit -m "feat: terminal integration — link provider + command execution"
```

---

## Phase 4: Kanban Board (Task 009)

### Task 009: Kanban board display — tree view of tasks with status columns

**Objective:** Display Kanban tasks in a dedicated sidebar tree view, organized by status (Todo, In Progress, Done). Click to see task details.

**Files:**
- Create: `src/providers/kanban-tree.ts`
- Create: `src/webview/kanban.html`
- Modify: `src/extension.ts`
- Modify: `package.json` (add kanban view)

**Step 1: Kanban tree data provider**

```typescript
import * as vscode from 'vscode';
import { HermesApiClient } from '../api/client';
import { KanbanTask } from '../api/types';

class TaskTreeItem extends vscode.TreeItem {
  constructor(public readonly task: KanbanTask) {
    super(task.title, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${task.status} — priority: ${task.priority ?? 'N/A'}`;
    this.contextValue = `task_${task.status}`;
    this.iconPath = getStatusIcon(task.status);
  }
}

class ColumnTreeItem extends vscode.TreeItem {
  constructor(public readonly column: string, public readonly tasks: KanbanTask[]) {
    super(column, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon('list');
  }
}

function getStatusIcon(status: string): vscode.ThemeIcon {
  switch (status.toLowerCase()) {
    case 'todo': return new vscode.ThemeIcon('circle-outline');
    case 'in_progress': case 'running': return new vscode.ThemeIcon('sync~spin');
    case 'done': case 'completed': return new vscode.ThemeIcon('check');
    case 'blocked': return new vscode.ThemeIcon('warning');
    default: return new vscode.ThemeIcon('circle-outline');
  }
}

export class KanbanTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private tasks: KanbanTask[] = [];

  constructor(private apiClient: HermesApiClient) {}

  refresh() {
    this.apiClient.getKanbanBoard().then(board => {
      this.tasks = board.tasks || [];
      this._onDidChangeTreeData.fire(undefined);
    }).catch(err => {
      vscode.window.showErrorMessage(`Kanban refresh failed: ${err.message}`);
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const columns: Record<string, KanbanTask[]> = { todo: [], in_progress: [], done: [], blocked: [] };
    for (const task of this.tasks) {
      const col = (task.status || 'todo').toLowerCase().replace(/\s+/g, '_');
      if (!columns[col]) columns[col] = [];
      columns[col].push(task);
    }
    const result: vscode.TreeItem[] = [];
    for (const [col, tasks] of Object.entries(columns)) {
      if (tasks.length === 0) continue;
      result.push(new ColumnTreeItem(col, tasks));
      // Children would be individual tasks
    }
    return result;
  }
}
```

**Step 2: Register in extension.ts**

```typescript
import { KanbanTreeProvider } from './providers/kanban-tree';

let kanbanProvider: KanbanTreeProvider;

export function activate(context: vscode.ExtensionContext) {
  // ... existing
  kanbanProvider = new KanbanTreeProvider(apiClient);
  const kanbanView = vscode.window.createTreeView('hermes.kanban', { treeDataProvider: kanbanProvider });
  context.subscriptions.push(
    kanbanView,
    vscode.commands.registerCommand('hermesExtension.refreshKanban', () => kanbanProvider.refresh()),
    vscode.commands.registerCommand('hermesExtension.showKanban', () => {
      vscode.commands.executeCommand('hermes.kanban.focus');
      kanbanProvider.refresh();
    })
  );
}
```

**Step 3: Add kanban view to package.json**

```json
"views": {
  "hermes": [
    { "type": "webview", "id": "hermes.session", "name": "Chat" },
    { "id": "hermes.kanban", "name": "Kanban Board" }
  ]
},
"commands": [
  // ... existing
  { "command": "hermesExtension.refreshKanban", "title": "Hermes: Refresh Kanban", "icon": "$(refresh)" }
],
"menus": {
  "view/title": [
    { "command": "hermesExtension.refreshKanban", "when": "view == hermes.kanban", "group": "navigation" }
  ]
}
```

**Step 4: Compile and verify**

```bash
npm run compile
```

Expected: Kanban tree view appears in sidebar, refreshes on button click.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: kanban board — tree view with status columns + refresh"
```

---

## Phase 5: File Navigation (Task 010)

### Task 010: Workspace file navigation — file tree in webview with open-in-editor

**Objective:** Show the current workspace file tree in the sidebar, allow clicking to open files in the editor, and highlight the active file.

**Files:**
- Create: `src/providers/file-tree.ts`
- Modify: `src/extension.ts`
- Modify: `package.json` (add file tree view)

**Step 1: File tree provider**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(filePath, collapsibleState);
    this.contextValue = collapsibleState === vscode.TreeItemCollapsibleState.None ? 'file' : 'folder';
    this.iconPath = vscode.ThemeIcon.File;
    if (collapsibleState !== vscode.TreeItemCollapsibleState.None) {
      this.iconPath = vscode.ThemeIcon.Folder;
    }
    const basename = path.basename(filePath);
    this.label = basename;
    this.tooltip = filePath;
    this.command = {
      command: 'hermesExtension.openFile',
      title: 'Open File',
      arguments: [filePath],
    };
  }
}

export class FileTreeProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    // Update icon based on file extension
    if (element.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      const ext = path.extname(element.filePath).slice(1);
      switch (ext) {
        case 'ts': case 'tsx': element.iconPath = new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.yellow')); break;
        case 'js': case 'jsx': element.iconPath = new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.yellow')); break;
        case 'py': element.iconPath = new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.blue')); break;
        case 'md': element.iconPath = new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.green')); break;
        case 'json': element.iconPath = new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.orange')); break;
      }
    }
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!root) return [];
    const dir = element ? element.filePath : root;

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const items: FileTreeItem[] = [];
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        const state = entry.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        items.push(new FileTreeItem(fullPath, state));
      }
      return items;
    } catch {
      return [];
    }
  }
}
```

**Step 2: Register in extension.ts**

```typescript
import { FileTreeProvider } from './providers/file-tree';

export function activate(context: vscode.ExtensionContext) {
  // ... existing
  const fileProvider = new FileTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('hermes.files', { treeDataProvider: fileProvider }),
    vscode.commands.registerCommand('hermesExtension.openFile', async (filePath: string) => {
      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Cannot open file: ${err.message}`);
      }
    })
  );
}
```

**Step 3: Add file tree to package.json**

```json
"views": {
  "hermes": [
    { "type": "webview", "id": "hermes.session", "name": "Chat" },
    { "id": "hermes.kanban", "name": "Kanban Board" },
    { "id": "hermes.files", "name": "Files" }
  ]
}
```

**Step 4: Compile and verify**

```bash
npm run compile
code --extensionDevelopmentPath=. .
```

Expected: File tree view in sidebar, clicking a file opens it in editor.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: file navigation — workspace tree with open-in-editor"
```

---

## Summary

### Timeline

| Phase | Tasks | Estimation |
|-------|-------|------------|
| Foundation | 001-004 | 4 hours |
| Chat | 005-007 | 6 hours |
| Terminal | 008 | 2 hours |
| Kanban | 009 | 3 hours |
| Files | 010 | 2 hours |
| **Total** | **10 tasks** | **~17 hours** |

### File count

| Type | Count | Files |
|------|-------|-------|
| TypeScript source | 9 | extension, config, api/client, api/types, providers/chat-provider, providers/kanban-tree, providers/terminal-link-provider, providers/terminal-command, providers/file-tree, utils/context |
| Webview assets | 2 | chat.html, session.html |
| Config | 3 | tsconfig.json, .eslintrc.json, .gitignore |
| Test | 1 | tests/config.test.ts |
| **Total** | **15 files** | |

### Risks

1. **Hermes API surface** — The `/v1/chat`, `/v1/chat/stream`, `/v1/kanban`, `/v1/execute` endpoints are assumed. If the actual Hermes gateway uses different paths, the API client needs adjustment. **Mitigation:** Verify actual Hermes API spec before Task 004.
2. **SSE support** — Streaming requires Hermes gateway to support SSE. If not available, fall back to chunked polling.
3. **Cursor-specific APIs** — Cursor may have extensions to the VS Code API not documented in the standard API. Most features should work on both, but verify with actual Cursor installation.

### Open questions

1. Should the chat webview persist conversation history across VS Code sessions? (localStorage in webview vs. extension context.storagePath)
2. Should kanban board support inline status changes (drag-and-drop between columns)?
3. Should file navigation be a collapsible section inside the chat webview instead of a separate tree view?

---

## Verification checklist

After all 10 tasks are complete:

- [ ] `npm run compile` succeeds with zero errors
- [ ] `npm run lint` passes with zero warnings
- [ ] Extension activates in VS Code without console errors
- [ ] Sidebar shows Hermes icon + 3 sections (Chat, Kanban, Files)
- [ ] Chat sends message → receives streamed response
- [ ] Chat includes active file context when available
- [ ] Kanban board shows tasks from Hermes, refreshable
- [ ] File tree shows workspace files, clickable to open
- [ ] Terminal commands palette entry works
- [ ] Health check warning appears when Hermes is offline
- [ ] Config change (apiUrl) detected live
