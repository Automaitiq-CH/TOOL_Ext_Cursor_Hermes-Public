# Introducing Hermes Agent for Cursor & VS Code — Your AI Agent, Inside Your Editor

We're thrilled to announce **Hermes Agent for Cursor & VS Code**, a native extension that brings the full power of [Hermes Agent](https://github.com/NousResearch/hermes-agent) directly into your code editor. No more switching between terminal windows and browser tabs — chat with your AI agent, manage tasks, and monitor your workflow from a single sidebar.

---

## What is Hermes Agent?

Hermes Agent, by [Nous Research](https://nousresearch.com), is an open-source AI agent that lives in your terminal and handles coding, research, infrastructure, and automation tasks. It connects to any LLM provider, supports multi-agent workflows via Kanban boards, and has a rich skill system that lets it tackle anything from debugging to deployment.

Until now, it was terminal-only. Today, that changes.

## What the Extension Does

The extension adds a **native sidebar** to Cursor and VS Code with five integrated tabs:

### Chat
Converse with Hermes Agent directly in your editor. Messages stream in real-time, sessions persist across restarts, and your project context — open files, Git status, project type — is automatically enriched in every conversation. No copy-pasting context anymore.

### Kanban Board
View your multi-agent task board with tasks grouped by status: Todo, In Progress, Done, and Blocked. Auto-refreshes every 60 seconds. Perfect for teams running complex orchestration workflows with Hermes.

### Terminal
Run any `hermes` command from the sidebar with live output streaming. Predefined buttons for common commands (status, kanban list, sessions, skills, cron, logs) plus free-form input for anything else.

### Files
Browse, search, and open workspace files. See currently open editors and switch between them. A lightweight file navigator that complements VS Code's built-in Explorer.

### Settings
Configure your gateway URL, profile, and preferences — all from within the sidebar.

## Key Benefits

**Context-aware conversations.** The extension automatically detects your project root, Git status, open files, and key configuration files. Every message you send to Hermes carries this context, so the agent always knows what you're working on.

**Zero configuration.** If `hermes` is in your `PATH`, the extension works out of the box. No API keys to configure, no complex setup — just install and start chatting.

**Native feel.** Designed dark-first with an indigo/navy palette that blends seamlessly with your IDE. The sidebar looks and behaves like a built-in panel, not a bolted-on widget.

**Full CLI access.** Every Hermes feature is accessible — sessions, skills, cron jobs, logs, config. The extension is a graphical layer on top of the CLI, not a limited subset.

**Open source and extensible.** MIT-licensed, built with TypeScript, and designed for contribution. The codebase is clean and approachable.

## Use Cases

- **Solo developers**: Chat with Hermes about your codebase without leaving the editor. Ask it to debug, refactor, write tests, or explain complex logic.
- **Multi-agent teams**: Use the Kanban board to track tasks across multiple AI agents working in parallel on your project.
- **Infrastructure work**: Run Hermes CLI commands (deploy, cron, logs) from the sidebar while editing config files in the main editor.
- **Learning and exploration**: Browse available skills, search past sessions, and discover what Hermes can do — all from a visual interface.

## Getting Started

### Requirements
- Cursor or VS Code 1.85+
- Hermes Agent CLI installed ([installation guide](https://hermes-agent.nousresearch.com/docs))

### Install

**From VSIX** (current):
1. Download the latest `.vsix` from [GitHub Releases](https://github.com/Automaitiq/TOOL_Ext_Cursor_Hermes/releases)
2. In VS Code/Cursor: Extensions → `...` menu → Install from VSIX

**From source**:
```bash
git clone https://github.com/Automaitiq/TOOL_Ext_Cursor_Hermes.git
cd TOOL_Ext_Cursor_Hermes
npm install && npm run compile && npm run package
```

**Marketplace** (coming soon): The extension will be available on the VS Code Marketplace and Open VSX Registry.

## Links

- **GitHub Repository**: [github.com/Automaitiq/TOOL_Ext_Cursor_Hermes](https://github.com/Automaitiq/TOOL_Ext_Cursor_Hermes)
- **Hermes Agent Documentation**: [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs)
- **VS Code Marketplace**: [marketplace.visualstudio.com/items?itemName=automaitiq.hermes-agent](https://marketplace.visualstudio.com/items?itemName=automaitiq.hermes-agent)
- **Open VSX Registry**: [open-vsx.org/extension/automaitiq/hermes-agent](https://open-vsx.org/extension/automaitiq/hermes-agent)
- **Report Issues**: [GitHub Issues](https://github.com/Automaitiq/TOOL_Ext_Cursor_Hermes/issues)

## What's Next

This is version 0.1.0 — the MVP. On the roadmap:

- Enhanced Kanban interactions (inline status changes, task creation)
- Keyboard shortcuts for common actions
- Internationalization (i18n)
- Deeper VS Code settings integration
- Drag-and-drop task management

We'd love your feedback. Star the repo, open issues, and contribute — this is an open-source project built for the community.

---

*Built by [Automaitiq](https://automaitiq.com) with ❤️ — MIT Licensed*
