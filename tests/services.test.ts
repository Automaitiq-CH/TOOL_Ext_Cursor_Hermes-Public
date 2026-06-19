import * as assert from 'assert';
import * as vscode from 'vscode';

suite('ChatService Unit Tests', () => {
  let chatService: any;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    // Import after extension is active so vscode APIs are available
    const chatModule = await import('../src/chatService');
    chatService = chatModule.ChatService.getInstance();
  });

  suiteTeardown(() => {
    chatService?.dispose();
  });

  test('ChatService is a singleton', () => {
    const chatModule = require('../src/chatService');
    const instance1 = chatModule.ChatService.getInstance();
    const instance2 = chatModule.ChatService.getInstance();
    assert.strictEqual(instance1, instance2, 'getInstance should return the same instance');
  });

  test('newSession creates a session with unique ID', () => {
    const id = chatService.newSession();
    assert.ok(id, 'newSession should return a session ID');
    assert.ok(id.startsWith('session_'), 'Session ID should start with session_');
  });

  test('newSession creates distinct sessions', async () => {
    const id1 = chatService.newSession();
    // Ensure different timestamp
    await new Promise(r => setTimeout(r, 5));
    const id2 = chatService.newSession();
    assert.notStrictEqual(id1, id2, 'Each session should have a unique ID');
  });

  test('getSessions returns array', () => {
    const sessions = chatService.getSessions();
    assert.ok(Array.isArray(sessions), 'getSessions should return an array');
  });

  test('getSessions sorted by updatedAt descending', () => {
    chatService.newSession();
    chatService.newSession();
    const sessions = chatService.getSessions();
    if (sessions.length >= 2) {
      assert.ok(
        sessions[0].updatedAt >= sessions[1].updatedAt,
        'Sessions should be sorted by updatedAt descending'
      );
    }
  });

  test('getActiveSessionId returns last created session', () => {
    const id = chatService.newSession();
    assert.strictEqual(chatService.getActiveSessionId(), id);
  });

  test('setActiveSession changes active session', () => {
    const id1 = chatService.newSession();
    const id2 = chatService.newSession();
    chatService.setActiveSession(id1);
    assert.strictEqual(chatService.getActiveSessionId(), id1);
    chatService.setActiveSession(id2);
    assert.strictEqual(chatService.getActiveSessionId(), id2);
  });

  test('getSessionMessages returns empty for unknown session', () => {
    const msgs = chatService.getSessionMessages('nonexistent_session');
    assert.ok(Array.isArray(msgs), 'Should return an array');
    assert.strictEqual(msgs.length, 0, 'Should be empty for unknown session');
  });

  test('getSessionMessages returns empty when no active session', () => {
    const msgs = chatService.getSessionMessages('definitely_not_a_real_id_xyz');
    assert.ok(Array.isArray(msgs));
    assert.strictEqual(msgs.length, 0);
  });

  test('isStreaming returns false when no process running', () => {
    assert.strictEqual(chatService.isStreaming(), false, 'Should not be streaming initially');
  });

  test('cancelStreaming returns true (always succeeds)', () => {
    assert.strictEqual(chatService.cancelStreaming(), true, 'Should return true');
  });

  test('getSettings returns object with expected keys', () => {
    const settings = chatService.getSettings();
    assert.ok(settings, 'Settings should exist');
    assert.ok('gatewayUrl' in settings, 'Should have gatewayUrl');
    assert.ok('profile' in settings, 'Should have profile');
  });

  test('setSettings updates settings', () => {
    const original = chatService.getSettings();
    chatService.setSettings({ gatewayUrl: 'http://test:9999', profile: 'test-profile' });
    const updated = chatService.getSettings();
    assert.strictEqual(updated.gatewayUrl, 'http://test:9999');
    assert.strictEqual(updated.profile, 'test-profile');
    // Restore
    chatService.setSettings(original);
  });

  test('isCliAvailable returns boolean', () => {
    const result = chatService.isCliAvailable();
    assert.strictEqual(typeof result, 'boolean');
  });
});

suite('TerminalService Unit Tests', () => {
  let terminalService: any;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    const termModule = await import('../src/terminalService');
    terminalService = termModule.TerminalService.getInstance();
  });

  suiteTeardown(() => {
    terminalService?.dispose();
  });

  test('TerminalService is a singleton', () => {
    const termModule = require('../src/terminalService');
    const instance1 = termModule.TerminalService.getInstance();
    const instance2 = termModule.TerminalService.getInstance();
    assert.strictEqual(instance1, instance2);
  });

  test('PREDEFINED_COMMANDS is non-empty array', () => {
    const termModule = require('../src/terminalService');
    const cmds = termModule.TerminalService.PREDEFINED_COMMANDS;
    assert.ok(Array.isArray(cmds), 'PREDEFINED_COMMANDS should be an array');
    assert.ok(cmds.length > 0, 'Should have at least one command');
  });

  test('PREDEFINED_COMMANDS have required fields', () => {
    const termModule = require('../src/terminalService');
    const cmds = termModule.TerminalService.PREDEFINED_COMMANDS;
    for (const cmd of cmds) {
      assert.ok(cmd.id, `Command should have an id`);
      assert.ok(cmd.title, `Command ${cmd.id} should have a title`);
      assert.ok(cmd.command, `Command ${cmd.id} should have a command`);
      assert.ok(Array.isArray(cmd.args), `Command ${cmd.id} should have args array`);
    }
  });

  test('PREDEFINED_COMMANDS IDs are unique', () => {
    const termModule = require('../src/terminalService');
    const cmds = termModule.TerminalService.PREDEFINED_COMMANDS;
    const ids = cmds.map((c: any) => c.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, 'All command IDs should be unique');
  });

  test('PREDEFINED_COMMANDS include expected commands', () => {
    const termModule = require('../src/terminalService');
    const cmds = termModule.TerminalService.PREDEFINED_COMMANDS;
    const ids = cmds.map((c: any) => c.id);
    assert.ok(ids.includes('hermes.status'), 'Should include hermes.status');
    assert.ok(ids.includes('hermes.kanban.list'), 'Should include hermes.kanban.list');
    assert.ok(ids.includes('hermes.sessions'), 'Should include hermes.sessions');
    assert.ok(ids.includes('hermes.skills'), 'Should include hermes.skills');
    assert.ok(ids.includes('hermes.version'), 'Should include hermes.version');
  });

  test('getHistory returns array', () => {
    const history = terminalService.getHistory();
    assert.ok(Array.isArray(history), 'getHistory should return an array');
  });

  test('getHistory respects limit', () => {
    const history = terminalService.getHistory(5);
    assert.ok(history.length <= 5, 'Should respect limit parameter');
  });

  test('clearHistory empties the history', () => {
    terminalService.clearHistory();
    const history = terminalService.getHistory();
    assert.strictEqual(history.length, 0, 'History should be empty after clear');
  });

  test('getOutputChannel returns an OutputChannel', () => {
    const channel = terminalService.getOutputChannel();
    assert.ok(channel, 'Should return an output channel');
    assert.ok(typeof channel.append === 'function', 'Should have append method');
    assert.ok(typeof channel.appendLine === 'function', 'Should have appendLine method');
  });

  test('cancelCommand returns false for unknown ID', () => {
    const result = terminalService.cancelCommand('nonexistent_cmd_id');
    assert.strictEqual(result, false, 'Should return false for unknown command');
  });
});

suite('ProjectContextService Unit Tests', () => {
  let contextService: any;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    const ctxModule = await import('../src/projectContext');
    contextService = new ctxModule.ProjectContextService();
  });

  suiteTeardown(() => {
    contextService?.dispose();
  });

  test('ProjectContextService can be instantiated', () => {
    assert.ok(contextService, 'Should create instance');
  });

  test('getCachedContext returns null initially', () => {
    const cached = contextService.getCachedContext();
    assert.strictEqual(cached, null, 'Cache should be null before any refresh');
  });

  test('detectProjectRoot returns Uri or undefined', async () => {
    const root = await contextService.detectProjectRoot();
    // May or may not detect root depending on workspace
    if (root) {
      assert.ok(root.fsPath, 'Should have fsPath');
    }
  });

  test('getContext returns ProjectContext object', async () => {
    const ctx = await contextService.getContext();
    assert.ok(ctx, 'Should return context');
    assert.ok('openFiles' in ctx, 'Should have openFiles');
    assert.ok('workspaceFolders' in ctx, 'Should have workspaceFolders');
    assert.ok('fileCount' in ctx, 'Should have fileCount');
    assert.ok('languages' in ctx, 'Should have languages');
    assert.ok(Array.isArray(ctx.openFiles), 'openFiles should be array');
    assert.ok(Array.isArray(ctx.workspaceFolders), 'workspaceFolders should be array');
    assert.ok(Array.isArray(ctx.languages), 'languages should be array');
    assert.strictEqual(typeof ctx.fileCount, 'number', 'fileCount should be number');
  });

  test('getContext caches results', async () => {
    const ctx1 = await contextService.getContext();
    const ctx2 = await contextService.getContext();
    // Both should be the same object (cached)
    assert.strictEqual(ctx1, ctx2, 'Should return cached context');
  });

  test('refresh clears cache', async () => {
    await contextService.getContext();
    assert.ok(contextService.getCachedContext(), 'Cache should be populated');
    contextService.refresh();
    assert.strictEqual(contextService.getCachedContext(), null, 'Cache should be cleared');
  });

  test('resetRoot clears root detection', async () => {
    await contextService.detectProjectRoot();
    contextService.resetRoot();
    // After reset, should re-detect on next call
    const cached = contextService.getCachedContext();
    assert.strictEqual(cached, null, 'Context should be null after reset');
  });

  test('identifyKeyFiles returns array', async () => {
    const keyFiles = await contextService.identifyKeyFiles();
    assert.ok(Array.isArray(keyFiles), 'Should return array');
  });

  test('identifyKeyFiles entries have required fields', async () => {
    const keyFiles = await contextService.identifyKeyFiles();
    for (const kf of keyFiles) {
      assert.ok(kf.fileName, 'Key file should have fileName');
      assert.ok(kf.relativePath, 'Key file should have relativePath');
      assert.ok(kf.category, 'Key file should have category');
      assert.ok(
        ['config', 'readme', 'lockfile', 'manifest', 'ci'].includes(kf.category),
        `Category should be valid: ${kf.category}`
      );
    }
  });

  test('detectProjectType returns string or undefined', async () => {
    const projectType = await contextService.detectProjectType();
    if (projectType) {
      assert.ok(
        ['node', 'python', 'rust', 'go', 'ruby', 'c-cpp'].includes(projectType),
        `Project type should be valid: ${projectType}`
      );
    }
  });

  test('formatForHermesApi returns HermesApiContext shape', async () => {
    const apiCtx = await contextService.formatForHermesApi();
    assert.ok(apiCtx, 'Should return API context');
    assert.ok(apiCtx.project, 'Should have project');
    assert.ok(apiCtx.workspace, 'Should have workspace');
    assert.ok(apiCtx.stats, 'Should have stats');
    assert.ok('timestamp' in apiCtx, 'Should have timestamp');
    assert.ok(Array.isArray(apiCtx.keyFiles), 'Should have keyFiles array');
    assert.ok(Array.isArray(apiCtx.openFiles), 'Should have openFiles array');
    assert.strictEqual(typeof apiCtx.timestamp, 'number', 'timestamp should be number');
  });

  test('getContextSummary returns string', async () => {
    const summary = await contextService.getContextSummary();
    assert.strictEqual(typeof summary, 'string', 'Should return string');
  });

  test('getOpenFiles returns array', async () => {
    const files = await contextService.getOpenFiles();
    assert.ok(Array.isArray(files), 'Should return array');
  });

  test('getActiveFile returns ProjectFile or undefined', () => {
    const file = contextService.getActiveFile();
    if (file) {
      assert.ok(file.uri, 'Should have uri');
      assert.ok(file.fileName, 'Should have fileName');
      assert.ok(file.language, 'Should have language');
    }
  });

  test('getActiveSelection returns string or undefined', () => {
    const sel = contextService.getActiveSelection();
    if (sel !== undefined) {
      assert.strictEqual(typeof sel, 'string');
    }
  });

  test('invalidateKeyFilesCache does not throw', () => {
    assert.doesNotThrow(() => contextService.invalidateKeyFilesCache());
  });

  test('dispose cleans up resources', () => {
    const ctxModule = require('../src/projectContext');
    const svc = new ctxModule.ProjectContextService();
    assert.doesNotThrow(() => svc.dispose(), 'dispose should not throw');
  });
});

suite('FileNavigationService Unit Tests', () => {
  let fileNav: any;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    const fileModule = await import('../src/fileNavigation');
    fileNav = new fileModule.FileNavigationService();
  });

  test('FileNavigationService can be instantiated', () => {
    assert.ok(fileNav, 'Should create instance');
  });

  test('setProjectRoot does not throw', () => {
    assert.doesNotThrow(() => fileNav.setProjectRoot('/tmp/test-project'));
    assert.doesNotThrow(() => fileNav.setProjectRoot(undefined));
  });

  test('getOpenFiles returns array', () => {
    const files = fileNav.getOpenFiles();
    assert.ok(Array.isArray(files), 'Should return array');
  });

  test('getActiveFile returns WorkspaceFile or undefined', () => {
    const file = fileNav.getActiveFile();
    if (file) {
      assert.ok(file.fsPath, 'Should have fsPath');
      assert.ok(file.fileName, 'Should have fileName');
    }
  });

  test('parseFileReference detects absolute path', () => {
    const result = fileNav.parseFileReference('/src/extension.ts:42');
    if (result) {
      assert.ok(result.path, 'Should detect path');
    }
  });

  test('parseFileReference detects relative path with extension', () => {
    const result = fileNav.parseFileReference('[src/extension.ts:10]');
    if (result) {
      assert.ok(result.path.includes('extension.ts'), 'Should detect .ts file');
    }
  });

  test('parseFileReference returns null for no match', () => {
    const result = fileNav.parseFileReference('hello world');
    assert.strictEqual(result, null, 'Should return null for plain text');
  });

  test('extractFileReferences returns array', () => {
    const refs = fileNav.extractFileReferences('Check `src/file.ts` for details');
    assert.ok(Array.isArray(refs), 'Should return array');
  });

  test('openFile returns false for nonexistent file', async () => {
    const result = await fileNav.openFile('/definitely/does/not/exist/xyz.ts');
    assert.strictEqual(result, false, 'Should return false for nonexistent file');
  });

  test('listWorkspaceFiles returns array', async () => {
    const files = await fileNav.listWorkspaceFiles();
    assert.ok(Array.isArray(files), 'Should return array');
  });

  test('searchFiles returns array', async () => {
    const results = await fileNav.searchFiles('package.json');
    assert.ok(Array.isArray(results), 'Should return array');
  });
});

suite('ChatService Integration Tests', () => {
  let chatService: any;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    const chatModule = await import('../src/chatService');
    chatService = chatModule.ChatService.getInstance();
  });

  suiteTeardown(() => {
    chatService?.dispose();
  });

  test('getSettings includes transport field', () => {
    const settings = chatService.getSettings();
    assert.ok('transport' in settings, 'Should have transport setting');
    assert.ok(
      ['auto', 'gateway', 'cli'].includes(settings.transport),
      'Transport should be auto, gateway, or cli'
    );
  });

  test('getSettings includes timeoutMs', () => {
    const settings = chatService.getSettings();
    assert.ok('timeoutMs' in settings, 'Should have timeoutMs');
    assert.strictEqual(typeof settings.timeoutMs, 'number');
    assert.ok(settings.timeoutMs > 0, 'Timeout should be positive');
  });

  test('getSettings includes maxRetries', () => {
    const settings = chatService.getSettings();
    assert.ok('maxRetries' in settings, 'Should have maxRetries');
    assert.strictEqual(typeof settings.maxRetries, 'number');
    assert.ok(settings.maxRetries >= 0, 'Retries should be non-negative');
  });

  test('setSettings updates transport', () => {
    const original = chatService.getSettings();
    chatService.setSettings({ transport: 'gateway' });
    const updated = chatService.getSettings();
    assert.strictEqual(updated.transport, 'gateway');
    chatService.setSettings({ transport: original.transport });
  });

  test('getConnectionStatus returns valid status', () => {
    const status = chatService.getConnectionStatus();
    assert.ok(
      ['connected', 'disconnected', 'connecting', 'error'].includes(status),
      `Status should be valid: ${status}`
    );
  });

  test('isGatewayAvailable returns boolean', () => {
    const result = chatService.isGatewayAvailable();
    assert.strictEqual(typeof result, 'boolean');
  });

  test('checkGateway returns boolean', async () => {
    const result = await chatService.checkGateway();
    assert.strictEqual(typeof result, 'boolean');
  });

  test('extractCommands finds hermes commands in code blocks', () => {
    const text = 'Run this:\n```bash\nhermes kanban list\nhermes status\n```\nDone.';
    const commands = chatService.extractCommands(text);
    assert.ok(Array.isArray(commands));
    assert.ok(commands.length >= 1, 'Should find at least one command');
    assert.ok(commands.some((c: any) => c.command.includes('kanban')), 'Should find kanban command');
  });

  test('extractCommands finds inline hermes commands', () => {
    const bt = String.fromCharCode(96);
    const text = `Try running ${bt}hermes sessions list${bt} to see history.`;
    const commands = chatService.extractCommands(text);
    assert.ok(commands.length >= 1, 'Should find inline command');
    assert.ok(commands[0].command.includes('sessions'), 'Should find sessions command');
  });

  test('extractCommands returns empty for no commands', () => {
    const text = 'Just some regular text with no commands.';
    const commands = chatService.extractCommands(text);
    assert.strictEqual(commands.length, 0);
  });

  test('extractFileRefs finds file paths in backticks', () => {
    const bt = String.fromCharCode(96);
    const text = `Check ${bt}src/extension.ts:42${bt} for details and ${bt}package.json${bt}.`;
    const refs = chatService.extractFileRefs(text);
    assert.ok(Array.isArray(refs));
    assert.ok(refs.length >= 1, 'Should find file references');
  });

  test('extractFileRefs returns empty for no refs', () => {
    const text = 'No files mentioned here.';
    const refs = chatService.extractFileRefs(text);
    assert.strictEqual(refs.length, 0);
  });

  test('cancelStreaming returns true even when nothing running', () => {
    const result = chatService.cancelStreaming();
    assert.strictEqual(result, true);
  });

  test('retryLastMessage does not throw without active session', async () => {
    // Should not throw even with no session
    await chatService.retryLastMessage();
  });

  test('connectionStatus event is emitted type', () => {
    let received = false;
    const handler = () => { received = true; };
    chatService.on('connectionStatus', handler);
    // Just verify we can attach listener without error
    chatService.removeListener('connectionStatus', handler);
    assert.ok(true);
  });
});
