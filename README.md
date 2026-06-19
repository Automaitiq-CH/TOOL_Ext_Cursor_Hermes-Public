# Hermes Agent for Cursor

**AI coding agent powered by Hermes — right in your IDE.**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blueviolet.svg)]()
[![Cursor](https://img.shields.io/badge/Cursor-compatible-green.svg)]()

Bringing the full power of [Hermes Agent](https://github.com/NousResearch/hermes-agent) directly into your Cursor or VS Code editor. Manage kanban tasks, search sessions, execute commands, navigate files, and access your AI agent — all from a native sidebar.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Commands](#commands)
- [Sidebar Tabs](#sidebar-tabs)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Hermes CLI Integration** — Run any `hermes` command directly from the extension sidebar with live output
- **Kanban Board** — View your Hermes Kanban tasks, organized by status (todo, in progress, done, blocked), with auto-refresh every 60 seconds
- **Session Search** — Browse and search your Hermes session history
- **Skills Browser** — Discover and inspect available Hermes skills
- **Project Context Detection** — Automatically detects your project root, tracks open files, monitors active selection, and shows Git status (branch, staged/unstaged/untracked counts)
- **Workspace File Navigation** — Search and open files from your workspace, with a file list, open-files bar, and editor switching
- **Terminal Command Execution** — Execute predefined and custom Hermes commands with output channel integration
- **Dark/Light Theme Support** — Adapts to your IDE's color theme

---

## Requirements

- **Cursor** or **VS Code** version 1.85.0 or later
- **Hermes Agent CLI** installed and available in your `PATH`
  - Install Hermes: follow the [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs)

To verify your Hermes installation:
```bash
hermes --version
```

---

## Installation

### Option 1: From source (recommended for development)

```bash
# Clone the repository
git clone https://github.com/automaitiq/TOOL_Ext_Cursor_Hermes.git
cd TOOL_Ext_Cursor_Hermes

# Install dependencies
npm install

# Compile TypeScript
npm run compile
```

Then load the extension in VS Code / Cursor:

1. Open the **Extensions** view (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Linux/Windows)
2. Click the **...** menu → **Install from VSIX...**
3. Package the extension: `npm run package`
4. Select the generated `.vsix` file

### Option 2: Development mode

Run the extension directly from source in a debug session:

1. Open this project folder in VS Code / Cursor
2. Press `F5` (or **Run → Start Debugging**)
3. A new "Extension Development Host" window opens with the extension loaded

### Option 3: Marketplace (coming soon)

The extension will be available on the VS Code Marketplace and Cursor extensions catalog. Stay tuned!

---

## Configuration

The extension works out of the box with default settings. No configuration is required as long as `hermes` is available in your `PATH`.

The extension automatically detects:
- **Hermes CLI path** — searches `PATH` on startup
- **Project root** — walks up from the active file looking for `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod`
- **Git status** — uses VS Code's Git extension API (with CLI fallback)

### Predefined Commands

The extension ships with these predefined Hermes commands, accessible from the sidebar:

| Command | Description |
|---------|-------------|
| `hermes status` | Show Hermes agent status |
| `hermes kanban list` | List all kanban tasks |
| `hermes sessions list` | List recent sessions |
| `hermes skills list` | List available skills |
| `hermes cron list` | List scheduled cron jobs |
| `hermes logs` | View recent logs |
| `hermes config show` | Show current config |
| `hermes version` | Show Hermes version |

You can also run **custom commands** by typing any Hermes CLI command in the sidebar's command input.

---

## Usage

### Opening the Sidebar

The Hermes Agent icon appears in the **Activity Bar** on the left side of your editor. Click it to open the sidebar.

Alternatively, use the command palette:
- `Cmd+Shift+P` (macOS) / `Ctrl+Shift+P` (Linux/Windows)
- Type **Hermes: Open Sidebar**

### Running Commands

From the **Terminal** tab in the sidebar:
1. Click any predefined command button, or
2. Type a custom command in the input field (e.g., `status`, `kanban list`, `sessions list`)
3. Output appears in the sidebar and in the **Hermes Terminal** output channel

To view the full output channel:
- Command palette → **Hermes: Show Output Channel**

### Viewing Kanban Tasks

From the **Kanban** tab:
- Tasks are grouped by status: **Todo**, **In Progress**, **Done**, **Blocked**
- Auto-refreshes every 60 seconds
- Click the refresh button to reload immediately
- Click a task to see its details

### Browsing Files

From the **Files** tab:
- See all files in your workspace project root
- Search files by name using the search bar
- Click a file to open it in the editor
- See currently open files in the open-files bar at the top
- Switch between open editors with the left/right arrows

---

## Commands

All available VS Code commands:

| Command | Palette Name | Description |
|---------|-------------|-------------|
| `hermes.openSidebar` | Hermes: Open Sidebar | Focus the Hermes sidebar |
| `hermes.runCommand` | Hermes: Run Command | Run a custom Hermes CLI command |
| `hermes.showOutput` | Hermes: Show Output Channel | Open the Hermes Terminal output channel |
| `hermes.status` | Hermes: Show Status | Show Hermes connection status |
| `hermes.kanban.list` | Hermes: List Kanban Tasks | Fetch and display kanban tasks |
| `hermes.sessions` | Hermes: List Sessions | Fetch and display recent sessions |
| `hermes.skills` | Hermes: List Skills | Fetch and display available skills |
| `hermes.cron` | Hermes: List Cron Jobs | Fetch and display cron jobs |
| `hermes.logs` | Hermes: View Logs | Fetch and display recent logs |
| `hermes.config` | Hermes: Show Config | Display current Hermes configuration |
| `hermes.version` | Hermes: Show Version | Show Hermes and extension versions |
| `hermes.file.open` | Hermes: Open File | Open a file by path |
| `hermes.file.reveal` | Hermes: Reveal in Explorer | Reveal a file in the Explorer |
| `hermes.file.quickSwitch` | Hermes: Quick Switch File | Quick-open file picker |
| `hermes.inspectContext` | Hermes: Inspect Project Context | Debug: show detected project context |

---

## Sidebar Tabs

The sidebar has four tabs:

### Terminal
Execute Hermes CLI commands and view their output. Supports both predefined command buttons and free-form command input. Output streams in real-time. You can cancel running commands and clear the history.

### Kanban
Display your Hermes Kanban board tasks, organized by status. Features:
- Auto-refresh every 60 seconds
- Filter chips for quick status filtering
- Click a task to view its full details

### Sessions
Browse your Hermes session history. Search past conversations and jump back into previous agent sessions.

### Files
Workspace file navigation with:
- Complete file listing from your detected project root
- Real-time search/filter by filename
- Open-files bar showing currently open editors
- Editor switching (left/right navigation)
- Click any file to open it in the active editor

---

## Development

### Project Structure

```
TOOL_Ext_Cursor_Hermes/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── sidebarProvider.ts    # Webview sidebar with embedded HTML/CSS/JS
│   ├── projectContext.ts     # Project root detection, Git status, open files
│   ├── terminalService.ts    # Hermes CLI execution, output streaming
│   ├── fileNavigation.ts     # Workspace file listing, search, open
│   └── assets/
│       └── sidebar.css       # Sidebar styles
├── assets/                   # Branding assets (logo, icons)
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
├── .gitignore
├── branding.md               # Branding guide
├── generate_assets.py        # Asset generation script
└── README.md                 # This file
```

### Build Commands

```bash
# Install dependencies
npm install

# Compile (one-shot)
npm run compile

# Compile (watch mode)
npm run watch

# Lint
npm run lint

# Package as VSIX
npm run package

# Run tests
npm test
```

### Tech Stack

- **TypeScript** (ES2020, CommonJS)
- **VS Code Extension API** v1.85+
- **Webview API** for the sidebar UI
- **Node.js** `child_process` for Hermes CLI execution
- No bundler — compiles directly to `out/` with `tsc`

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature or bugfix
3. **Make your changes** and compile: `npm run compile`
4. **Test** in development mode: press `F5` in VS Code
5. **Submit a pull request**

### Areas We Need Help With

- Chat integration with Hermes Agent (streaming responses)
- More predefined command presets
- Enhanced Kanban interactions (inline status changes)
- Extension settings UI
- Internationalization (i18n)

---

## License

MIT — see the [LICENSE](LICENSE) file for details.

Built by [Automaitiq](https://automaitiq.com) with ❤️

---

## Support

- **Issues**: [GitHub Issues](https://github.com/automaitiq/TOOL_Ext_Cursor_Hermes/issues)
- **Documentation**: [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs)
