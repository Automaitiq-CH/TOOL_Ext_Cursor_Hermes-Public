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
      const chatHistoryPanel = document.getElementById('chat-history-panel');
      const chatHistoryList = document.getElementById('chat-history-list');

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
          if (data.sessionId) activeSessionId = data.sessionId;
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
        // Connection status updates from chat service
        if (command === 'connectionStatus') {
          updateConnectionIndicator(status);
        }
        // Gateway check result
        if (command === 'gatewayStatus') {
          updateGatewayIndicator(data);
        }
        // Populate the settings form with saved values
        if (command === 'settingsData') {
          populateSettings(event.data.settings);
        }
        // Result of resolving the manual CLI path
        if (command === 'cliPathStatus') {
          updateCliPathIndicator(event.data);
        }
        // SSH private key selected from the native file picker
        if (command === 'sshKeySelected') {
          var sshKeyInput = document.getElementById('ssh-key');
          if (sshKeyInput) sshKeyInput.value = event.data.path || '';
        }
        // Cancel streaming
        if (command === 'cancelStreaming') {
          finishStreamingMessage();
          setStreamingState(false);
        }
        // New chat session from backend
        if (command === 'newChatSession') {
          resetChatUI();
          activeSessionId = event.data.sessionId || data?.sessionId || null;
          if (chatHeaderTitle) chatHeaderTitle.textContent = 'Hermes Chat';
          if (chatHistoryPanel) chatHistoryPanel.classList.add('hidden');
        }
        // Restore persisted session on webview ready
        if (command === 'restoreSession') {
          var restored = data || event.data;
          activeSessionId = restored.sessionId || null;
          if (chatHeaderTitle) chatHeaderTitle.textContent = restored.title || 'Hermes Chat';
          // Show chat area, hide welcome
          if (chatArea) chatArea.classList.remove('hidden');
          if (chatWelcome) chatWelcome.classList.add('hidden');
          if (chatHistoryPanel) chatHistoryPanel.classList.add('hidden');
          chatInitialized = true;
          // Render all messages
          if (chatMessages) chatMessages.innerHTML = '';
          for (const msg of (restored.messages || [])) {
            appendChatMessage(msg);
          }
        }
        // Local chat history loaded from persisted conversations
        if (command === 'chatHistoryData') {
          renderChatHistory(event.data.sessions || []);
        }
        // Kanban data loaded
        if (command === 'kanbanData') {
          renderKanban(data);
        }
        // Sessions data loaded
        if (command === 'sessionsData') {
          renderSessions(data.sessions || []);
        }
      });

      // Initialize chat area when Hermes CLI is detected
      function initChatArea(status) {
        if (status === 'ready') {
          // Always reveal the chat area when Hermes becomes ready — even if an
          // earlier 'no-cli' status (e.g. before SSH was configured) had already
          // run this once. This is NOT one-shot for the ready transition.
          if (chatArea) chatArea.classList.remove('hidden');
          if (chatWelcome) chatWelcome.classList.add('hidden');
          if (chatStatusText) {
            chatStatusText.textContent = 'Hermes ready';
          }
          if (chatStatusBar) {
            chatStatusBar.classList.remove('error');
            chatStatusBar.classList.add('ready');
          }
          chatInitialized = true;
        } else {
          // Not reachable. Keep the welcome screen with an explanation, unless
          // the chat area is already open (don't yank it away mid-session).
          if (chatArea && !chatArea.classList.contains('hidden')) return;
          if (chatStatusText) {
            chatStatusText.textContent = 'Hermes not reachable — check Settings (CLI path / SSH host).';
          }
          if (chatStatusBar) {
            chatStatusBar.classList.remove('ready');
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

      // Finish streaming and add action buttons
      function finishStreamingMessage() {
        if (currentStreamingMsgId) {
          var sel2 = '[data-msg-id="' + currentStreamingMsgId + '"]';
          var el = chatMessages?.querySelector(sel2);
          if (el) {
            el.classList.remove('streaming');
          }
          // Extract commands and file refs from the completed message
          var contentEl = chatMessages?.querySelector(sel2 + ' .chat-bubble-content');
          if (contentEl) {
            addActionButtons(currentStreamingMsgId, contentEl.textContent || '');
          }
          currentStreamingMsgId = null;
        }
        setStreamingState(false);
      }

      // Show error message in chat with retry button
      function showChatError(errorText) {
        if (!chatMessages) return;
        setStreamingState(false);

        const div = document.createElement('div');
        div.className = 'chat-bubble chat-bubble-error';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-bubble-content';
        contentDiv.innerHTML = '&#9888; ' + escapeHtml(errorText);
        div.appendChild(contentDiv);

        // Retry button
        const retryBtn = document.createElement('button');
        retryBtn.className = 'chat-retry-btn';
        retryBtn.textContent = '&#8635; Retry';
        retryBtn.innerHTML = '&#8635; Retry';
        retryBtn.title = 'Retry last message';
        retryBtn.addEventListener('click', function() {
          div.remove();
          vscodeApi.postMessage({ command: 'retryLastMessage' });
          setStreamingState(true);
        });
        div.appendChild(retryBtn);

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      // Reset chat UI for new session
      function resetChatUI() {
        if (chatMessages) chatMessages.innerHTML = '';
        currentStreamingMsgId = null;
        setStreamingState(false);
        if (chatInput) { chatInput.disabled = false; chatInput.value = ''; chatInput.placeholder = 'Ask Hermes anything...'; }
        if (chatInput) chatInput.style.height = 'auto';
      }

      function renderChatHistory(sessions) {
        if (!chatHistoryList) return;
        if (!sessions || sessions.length === 0) {
          chatHistoryList.innerHTML = '<div class="empty-state compact"><p>No conversations yet.</p></div>';
          return;
        }
        chatHistoryList.innerHTML = '';
        for (var i = 0; i < sessions.length; i++) {
          (function(session) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'chat-history-item' + (session.active ? ' active' : '');
            item.title = session.title || 'Open conversation';
            item.innerHTML =
              '<div class="chat-history-title">' + escapeHtml(session.title || 'New Chat') + '</div>' +
              '<div class="chat-history-preview">' + escapeHtml(session.preview || 'No messages yet') + '</div>' +
              '<div class="chat-history-meta">' +
                '<span>' + escapeHtml(formatRelativeTime(session.updatedAt)) + '</span>' +
                '<span>' + String(session.messageCount || 0) + ' messages</span>' +
              '</div>';
            item.addEventListener('click', function() {
              vscodeApi.postMessage({ command: 'openChatSession', sessionId: session.id });
            });
            chatHistoryList.appendChild(item);
          })(sessions[i]);
        }
      }

      // Update chat header title from first user message
      function updateChatTitle(text) {
        if (!chatHeaderTitle) return;
        const preview = text.slice(0, 40);
        chatHeaderTitle.textContent = preview + (text.length > 40 ? '...' : '');
      }

      // Format message content (support markdown-ish code blocks + action buttons)
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

      // After streaming completes, add action buttons for commands and file refs
      function addActionButtons(msgId, content) {
        if (!chatMessages) return;
        var sel = '[data-msg-id="' + msgId + '"]';
        var bubble = chatMessages.querySelector(sel);
        if (!bubble) return;

        // Extract hermes commands from content
        var commands = [];
        var bt3 = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
        var codeBlockRegex = new RegExp(bt3 + '(?:sh|bash|shell|terminal)?\\s*\\n([\\s\\S]*?)' + bt3, 'g');
        var match;
        while ((match = codeBlockRegex.exec(content)) !== null) {
          var lines = match[1].trim().split('\\n');
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim().replace(/^\\$\\s*/, '');
            if (line.startsWith('hermes ')) {
              commands.push(line);
            }
          }
        }
        // Inline hermes commands
        var bt = String.fromCharCode(96);
        var inlineRegex = new RegExp(bt + '(hermes\\s+[^' + bt + ']+)' + bt, 'g');
        while ((match = inlineRegex.exec(content)) !== null) {
          var cmd = match[1].trim();
          if (commands.indexOf(cmd) === -1) commands.push(cmd);
        }

        // Extract file references
        var fileRefs = [];
        var fileRegex = new RegExp(bt + '([^' + bt + '\\s]+\\.\\w{2,5})(?::(\\d+))?' + bt, 'g');
        while ((match = fileRegex.exec(content)) !== null) {
          var fp = match[1];
          var ln = match[2] ? parseInt(match[2], 10) : undefined;
          if (fp.indexOf('hermes') === -1 && !commands.some(function(c) { return c.indexOf(fp) !== -1; })) {
            fileRefs.push({ path: fp, line: ln });
          }
        }

        if (commands.length === 0 && fileRefs.length === 0) return;

        var actionBar = document.createElement('div');
        actionBar.className = 'chat-action-bar';

        for (var ci = 0; ci < commands.length; ci++) {
          (function(cmd) {
            var btn = document.createElement('button');
            btn.className = 'chat-action-btn chat-action-cmd';
            btn.title = 'Run: ' + cmd;
            btn.textContent = '\u25B6 ' + cmd;
            btn.addEventListener('click', function() {
              vscodeApi.postMessage({ command: 'runChatCommand', command: cmd });
              btn.classList.add('executed');
              btn.textContent = '\u2713 ' + cmd;
            });
            actionBar.appendChild(btn);
          })(commands[ci]);
        }

        for (var fi = 0; fi < fileRefs.length; fi++) {
          (function(ref) {
            var btn = document.createElement('button');
            btn.className = 'chat-action-btn chat-action-file';
            btn.title = 'Open: ' + ref.path + (ref.line ? ':' + ref.line : '');
            btn.textContent = '\uD83D\uDCC4 ' + ref.path + (ref.line ? ':' + ref.line : '');
            btn.addEventListener('click', function() {
              vscodeApi.postMessage({ command: 'openFileRef', filePath: ref.path, line: ref.line });
            });
            actionBar.appendChild(btn);
          })(fileRefs[fi]);
        }

        bubble.appendChild(actionBar);
      }

      // Update connection indicator in chat status bar
      function updateConnectionIndicator(status) {
        // Top-right badge in the header
        var badge = document.getElementById('connection-status');
        if (badge) {
          badge.className = 'status-badge ' + status;
          var badgeText = badge.querySelector('.status-text');
          var badgeLabels = { connected: 'Connected', connecting: 'Connecting...', error: 'Error', disconnected: 'Disconnected' };
          if (badgeText) badgeText.textContent = badgeLabels[status] || status;
        }
        if (!chatStatusBar || !chatStatusText) return;
        chatStatusBar.className = 'chat-status-bar ' + status;
        if (status === 'connected') {
          chatStatusText.textContent = 'Connected';
        } else if (status === 'connecting') {
          chatStatusText.textContent = 'Connecting...';
        } else if (status === 'error') {
          chatStatusText.textContent = 'Connection error';
        } else {
          chatStatusText.textContent = 'Disconnected';
        }
      }

      // Update gateway status indicator in settings
      function updateGatewayIndicator(data) {
        var el = document.getElementById('gateway-status');
        if (!el) return;
        if (data.available) {
          el.className = 'gateway-status available';
          el.textContent = '\u2713 Gateway reachable at ' + (data.url || '');
        } else {
          el.className = 'gateway-status unavailable';
          el.textContent = data.url
            ? '\u2717 Gateway not reachable' + (data.error ? ': ' + data.error : '')
            : 'Gateway URL is empty.';
        }
      }

      // Populate the settings form from saved values
      function populateSettings(s) {
        if (!s) return;
        var g = document.getElementById('gateway-url');
        var k = document.getElementById('api-key');
        var p = document.getElementById('profile');
        var t = document.getElementById('transport');
        var cm = document.getElementById('context-mode');
        var c = document.getElementById('cli-path');
        var sh = document.getElementById('ssh-target');
        var sp = document.getElementById('ssh-port');
        var su = document.getElementById('ssh-user');
        var sk = document.getElementById('ssh-key');
        var hh = document.getElementById('hermes-home');
        if (g) g.value = s.gatewayUrl || '';
        if (k) k.value = s.apiKey || '';
        if (p) p.value = s.profile || 'default';
        if (t) t.value = s.transport || 'auto';
        if (cm) cm.value = s.contextMode || 'workspace';
        if (c) c.value = s.cliPath || '';
        if (sh) sh.value = s.sshTarget || '';
        if (sp) sp.value = s.sshPort || '';
        if (su) su.value = s.sshUser || '';
        if (sk) sk.value = s.sshKey || '';
        if (hh) hh.value = s.hermesHome || '';
      }

      // Show whether hermes resolved (locally or over SSH)
      function updateCliPathIndicator(data) {
        var el = document.getElementById('cli-path-status');
        if (!el) return;
        if (data.valid === null) {
          el.className = 'gateway-status';
          el.textContent = 'Using auto-detection from PATH.';
        } else if (data.valid) {
          el.className = 'gateway-status available';
          el.textContent = data.ssh
            ? '\u2713 CLI reachable on ' + data.ssh
            : '\u2713 Found CLI at ' + (data.path || '');
        } else {
          el.className = 'gateway-status unavailable';
          el.textContent = data.ssh
            ? '\u2717 Could not run the CLI on ' + data.ssh + ' (check SSH access).'
            : '\u2717 No CLI binary at that path.';
        }
      }

      // Format timestamp
      function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      function formatRelativeTime(ts) {
        if (!ts) return '';
        var diff = Date.now() - ts;
        var minute = 60 * 1000;
        var hour = 60 * minute;
        var day = 24 * hour;
        if (diff < minute) return 'Just now';
        if (diff < hour) return Math.floor(diff / minute) + 'm ago';
        if (diff < day) return Math.floor(diff / hour) + 'h ago';
        if (diff < 7 * day) return Math.floor(diff / day) + 'd ago';
        return new Date(ts).toLocaleDateString();
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

      // Chat history panel
      document.getElementById('btn-chat-history')?.addEventListener('click', () => {
        if (chatHistoryPanel) chatHistoryPanel.classList.toggle('hidden');
        vscodeApi.postMessage({ command: 'loadChatHistory' });
      });
      document.getElementById('btn-refresh-chat-history')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'loadChatHistory' });
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

      // Save settings
      document.getElementById('btn-save-settings')?.addEventListener('click', () => {
        const gatewayUrl = document.getElementById('gateway-url').value;
        const apiKey = document.getElementById('api-key').value;
        const profile = document.getElementById('profile').value;
        const transport = document.getElementById('transport')?.value || 'auto';
        const contextMode = document.getElementById('context-mode')?.value || 'workspace';
        const cliPath = document.getElementById('cli-path')?.value || '';
        const sshTarget = document.getElementById('ssh-target')?.value || '';
        const sshPort = document.getElementById('ssh-port')?.value || '';
        const sshUser = document.getElementById('ssh-user')?.value || '';
        const sshKey = document.getElementById('ssh-key')?.value || '';
        const hermesHome = document.getElementById('hermes-home')?.value || '';
        var cliStatusEl = document.getElementById('cli-path-status');
        if (cliStatusEl) {
          cliStatusEl.className = 'gateway-status checking';
          cliStatusEl.textContent = sshTarget ? 'Checking CLI over SSH...' : 'Saving...';
        }
        vscodeApi.postMessage({
          command: 'saveSettings',
          settings: { gatewayUrl, apiKey, profile, transport, contextMode, cliPath, sshTarget, sshPort, sshUser, sshKey, hermesHome }
        });
      });

      // Pick SSH private key from the native VS Code/Cursor file dialog
      document.getElementById('btn-choose-ssh-key')?.addEventListener('click', () => {
        vscodeApi.postMessage({ command: 'selectSshKey' });
      });

      // Test gateway button
      document.getElementById('btn-check-gateway')?.addEventListener('click', () => {
        var el = document.getElementById('gateway-status');
        if (el) {
          el.className = 'gateway-status checking';
          el.textContent = 'Checking...';
        }
        vscodeApi.postMessage({ command: 'checkGateway' });
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
      let searchTimeout = null;
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
        var ext = fileName.split('.').pop();
        if (ext) ext = ext.toLowerCase(); else ext = '';
        var icons = {
          ts: 'TS', tsx: '⚛', js: 'JS', jsx: '⚛', py: '🐍',
          json: '📋', md: '📝', css: '🎨', html: '🌐', yaml: '⚙',
          yml: '⚙', toml: '⚙', sh: '⚡', dockerfile: '🐳',
          git: '📦', lock: '🔒', env: '🔑', sql: '🗄',
        };
        return icons[ext] || '📄';
      }

      // Kanban rendering
      function renderKanban(data) {
        var container = document.getElementById('kanban-content');
        if (!container) return;
        if (data && data.error) {
          container.innerHTML = '<div class="empty-state"><p>Error loading kanban: ' + escapeHtml(data.error) + '</p></div>';
          return;
        }

        var tasks = normalizeKanbanTasks(data);
        if (!tasks.length) {
          container.innerHTML = '<div class="empty-state"><p>No kanban tasks found.</p></div>';
          return;
        }

        var columns = [
          { key: 'todo', title: 'To do', items: [] },
          { key: 'doing', title: 'In progress', items: [] },
          { key: 'review', title: 'Review', items: [] },
          { key: 'done', title: 'Done', items: [] },
          { key: 'other', title: 'Other', items: [] },
        ];
        var byKey = {};
        for (var ci = 0; ci < columns.length; ci++) byKey[columns[ci].key] = columns[ci];

        for (var i = 0; i < tasks.length; i++) {
          var task = tasks[i];
          var key = normalizeKanbanStatus(task.status);
          (byKey[key] || byKey.other).items.push(task);
        }

        container.innerHTML = '';
        var board = document.createElement('div');
        board.className = 'kanban-board';
        for (var c = 0; c < columns.length; c++) {
          var col = columns[c];
          if (col.key === 'other' && col.items.length === 0) continue;
          var column = document.createElement('section');
          column.className = 'kanban-column kanban-column-' + col.key;

          var header = document.createElement('div');
          header.className = 'kanban-column-header';
          header.innerHTML = '<span>' + escapeHtml(col.title) + '</span><span class="kanban-count">' + col.items.length + '</span>';
          column.appendChild(header);

          var list = document.createElement('div');
          list.className = 'kanban-card-list';
          if (col.items.length === 0) {
            list.innerHTML = '<div class="kanban-empty">No tasks</div>';
          } else {
            for (var j = 0; j < col.items.length; j++) {
              list.appendChild(createKanbanCard(col.items[j]));
            }
          }
          column.appendChild(list);
          board.appendChild(column);
        }
        container.appendChild(board);
      }

      function normalizeKanbanTasks(data) {
        var parsed = data;
        if (typeof parsed === 'string') {
          var text = parsed.trim();
          if (!text) return [];
          try {
            parsed = JSON.parse(text);
          } catch (e) {
            return text.split('\n').filter(Boolean).map(function(line, idx) {
              return { id: 'line-' + idx, title: line, status: 'other' };
            });
          }
        }
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
        if (parsed && parsed.data && Array.isArray(parsed.data)) return parsed.data;
        return [];
      }

      function normalizeKanbanStatus(status) {
        var s = String(status || '').toLowerCase().replace(/[\s-]+/g, '_');
        if (['todo', 'to_do', 'open', 'new', 'backlog', 'pending'].indexOf(s) !== -1) return 'todo';
        if (['doing', 'in_progress', 'progress', 'started', 'active', 'running'].indexOf(s) !== -1) return 'doing';
        if (['review', 'in_review', 'blocked', 'qa', 'testing'].indexOf(s) !== -1) return 'review';
        if (['done', 'completed', 'complete', 'closed', 'finished'].indexOf(s) !== -1) return 'done';
        return 'other';
      }

      function createKanbanCard(task) {
        var card = document.createElement('article');
        card.className = 'kanban-card';
        var title = task.title || task.name || task.id || 'Untitled task';
        var body = task.body || task.description || task.summary || '';
        var meta = [];
        if (task.id) meta.push('#' + String(task.id));
        if (task.priority !== undefined && task.priority !== null) meta.push('P' + String(task.priority));
        if (task.assignee) meta.push(String(task.assignee));

        card.innerHTML =
          '<div class="kanban-card-title">' + escapeHtml(title) + '</div>' +
          (body ? '<div class="kanban-card-body">' + escapeHtml(formatKanbanBody(body)) + '</div>' : '') +
          (meta.length ? '<div class="kanban-card-meta">' + meta.map(escapeHtml).join(' · ') + '</div>' : '');
        return card;
      }

      function formatKanbanBody(body) {
        return String(body).replace(/\\n/g, '\n').trim();
      }

      document.getElementById('btn-refresh-kanban')?.addEventListener('click', function() {
        var container = document.getElementById('kanban-content');
        if (container) container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
        vscodeApi.postMessage({ command: 'loadKanban' });
      });

      // Auto-load kanban on tab click
      document.querySelector('[data-tab="kanban"]')?.addEventListener('click', function() {
        vscodeApi.postMessage({ command: 'loadKanban' });
      });

      // Sessions rendering
      function renderSessions(sessions) {
        var container = document.getElementById('sessions-content');
        if (!container) return;
        if (!sessions || sessions.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>No sessions found.</p></div>';
          return;
        }
        container.innerHTML = '';
        for (var i = 0; i < sessions.length; i++) {
          var s = sessions[i];
          var item = document.createElement('div');
          item.className = 'session-item';
          item.innerHTML =
            '<div class="session-title">' + escapeHtml(s.title || 'Untitled') + '</div>' +
            '<div class="session-meta">' + escapeHtml(s.when || '') + '</div>' +
            '<div class="session-preview">' + escapeHtml(s.preview || '') + '</div>';
          container.appendChild(item);
        }
      }

      document.getElementById('btn-refresh-sessions')?.addEventListener('click', function() {
        var container = document.getElementById('sessions-content');
        if (container) container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
        vscodeApi.postMessage({ command: 'loadSessions' });
      });

      // Auto-load sessions on tab click
      document.querySelector('[data-tab="sessions"]')?.addEventListener('click', function() {
        vscodeApi.postMessage({ command: 'loadSessions' });
      });

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    })();
