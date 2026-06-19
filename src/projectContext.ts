import * as path from 'path';
import * as vscode from 'vscode';

export interface ProjectFile {
  uri: string;
  fileName: string;
  relativePath: string;
  language: string;
  content?: string;
  selection?: {
    text: string;
    startLine: number;
    endLine: number;
  };
}

export interface GitStatus {
  root: string;
  branch: string;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

export interface KeyFile {
  fileName: string;
  relativePath: string;
  category: 'config' | 'readme' | 'lockfile' | 'manifest' | 'ci';
  content?: string;
  size?: number;
}

export interface HermesApiContext {
  project: {
    root: string | undefined;
    name: string | undefined;
    type: string | undefined;
  };
  workspace: {
    folders: string[];
    multiRoot: boolean;
  };
  git: GitStatus | undefined;
  keyFiles: KeyFile[];
  openFiles: ProjectFile[];
  activeFile: ProjectFile | undefined;
  activeSelection: string | undefined;
  stats: {
    fileCount: number;
    languages: string[];
  };
  timestamp: number;
}

export interface ProjectContext {
  projectRoot: string | undefined;
  projectName: string | undefined;
  workspaceFolders: string[];
  openFiles: ProjectFile[];
  activeFile: ProjectFile | undefined;
  activeSelection: string | undefined;
  git: GitStatus | undefined;
  fileCount: number;
  languages: string[];
}

const KEY_FILE_PATTERNS: Array<{ pattern: string; category: KeyFile['category'] }> = [
  { pattern: 'README.md', category: 'readme' },
  { pattern: 'README.rst', category: 'readme' },
  { pattern: 'README.txt', category: 'readme' },
  { pattern: 'README', category: 'readme' },
  { pattern: 'package.json', category: 'manifest' },
  { pattern: 'tsconfig.json', category: 'config' },
  { pattern: 'pyproject.toml', category: 'config' },
  { pattern: 'Cargo.toml', category: 'manifest' },
  { pattern: 'go.mod', category: 'manifest' },
  { pattern: 'Makefile', category: 'config' },
  { pattern: 'Dockerfile', category: 'config' },
  { pattern: 'docker-compose.yml', category: 'config' },
  { pattern: 'docker-compose.yaml', category: 'config' },
  { pattern: '.eslintrc.json', category: 'config' },
  { pattern: '.eslintrc.js', category: 'config' },
  { pattern: '.prettierrc', category: 'config' },
  { pattern: '.env.example', category: 'config' },
  { pattern: 'requirements.txt', category: 'manifest' },
  { pattern: 'Pipfile', category: 'manifest' },
  { pattern: 'Gemfile', category: 'manifest' },
  { pattern: '.github/workflows', category: 'ci' },
  { pattern: '.gitlab-ci.yml', category: 'ci' },
  { pattern: 'Jenkinsfile', category: 'ci' },
];

const MAX_KEY_FILE_SIZE = 8192;
const MAX_KEY_FILE_CONTENT = 4096;

export class ProjectContextService {
  private _rootUri: vscode.Uri | undefined;
  private _contextCache: ProjectContext | null = null;
  private _contextCacheTime: number = 0;
  private _keyFilesCache: KeyFile[] | null = null;
  private _keyFilesCacheTimer: NodeJS.Timeout | null = null;
  private _refreshDebounceTimer: NodeJS.Timeout | null = null;

  private _onDidChangeContext = new vscode.EventEmitter<HermesApiContext>();
  public readonly onDidChangeContext = this._onDidChangeContext.event;

  constructor() {}

  public dispose(): void {
    this._onDidChangeContext.dispose();
    if (this._keyFilesCacheTimer) {
      clearTimeout(this._keyFilesCacheTimer);
    }
    if (this._refreshDebounceTimer) {
      clearTimeout(this._refreshDebounceTimer);
    }
  }

  /**
   * Detect the project root directory.
   * Walks up from the active file or first workspace folder looking for:
   * .git, package.json, pyproject.toml, Cargo.toml, go.mod
   */
  public async detectProjectRoot(): Promise<vscode.Uri | undefined> {
    if (this._rootUri) {
      return this._rootUri;
    }

    const startUri = this.getStartUri();
    if (!startUri) {
      return undefined;
    }

    this._rootUri = await this.findProjectRoot(startUri.fsPath);
    return this._rootUri;
  }

  /**
   * Get the full project context snapshot.
   */
  public async getContext(): Promise<ProjectContext> {
    // Return cached context if less than 2 seconds old
    if (this._contextCache && (Date.now() - this._contextCacheTime) < 2000) {
      return this._contextCache;
    }

    const root = await this.detectProjectRoot();
    const rootPath = root?.fsPath;

    const openFiles = await this.getOpenFiles(rootPath);
    const activeFile = this.getActiveFile(rootPath);
    const activeSelection = this.getActiveSelection();
    const git = rootPath ? await this.getGitStatus(rootPath) : undefined;
    const { fileCount, languages } = await this.getProjectStats(rootPath);

    this._contextCache = {
      projectRoot: rootPath,
      projectName: rootPath ? path.basename(rootPath) : undefined,
      workspaceFolders: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) || [],
      openFiles,
      activeFile,
      activeSelection,
      git,
      fileCount,
      languages,
    };
    this._contextCacheTime = Date.now();

    return this._contextCache;
  }

  /**
   * Identify key project files (README, package.json, tsconfig.json, etc.)
   * Returns structured data about each found file.
   */
  public async identifyKeyFiles(rootPath?: string): Promise<KeyFile[]> {
    if (!rootPath) {
      rootPath = (await this.detectProjectRoot())?.fsPath;
    }
    if (!rootPath) {
      return [];
    }

    if (this._keyFilesCache && this._keyFilesCacheTimer) {
      return this._keyFilesCache;
    }

    const keyFiles: KeyFile[] = [];

    for (const { pattern, category } of KEY_FILE_PATTERNS) {
      const filePath = path.join(rootPath, pattern);
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        if (stat.type === vscode.FileType.File && stat.size <= MAX_KEY_FILE_SIZE) {
          keyFiles.push({
            fileName: path.basename(pattern),
            relativePath: pattern,
            category,
            size: stat.size,
          });
        } else if (stat.type === vscode.FileType.Directory) {
          keyFiles.push({
            fileName: path.basename(pattern),
            relativePath: pattern,
            category,
          });
        }
      } catch {
        // file not found, skip
      }
    }

    this._keyFilesCache = keyFiles;
    this._keyFilesCacheTimer = setTimeout(() => {
      this._keyFilesCache = null;
      this._keyFilesCacheTimer = null;
    }, 30000);

    return keyFiles;
  }

  /**
   * Read the content of key project files, truncated for context.
   */
  public async readKeyFileContents(rootPath?: string): Promise<KeyFile[]> {
    const keyFiles = await this.identifyKeyFiles(rootPath);
    const root = rootPath || (await this.detectProjectRoot())?.fsPath;
    if (!root) {
      return keyFiles;
    }

    const results: KeyFile[] = [];
    for (const kf of keyFiles) {
      const filePath = path.join(root, kf.relativePath);
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        if (stat.type === vscode.FileType.File) {
          const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
          const text = Buffer.from(bytes).toString('utf-8');
          kf.content = text.length > MAX_KEY_FILE_CONTENT
            ? text.slice(0, MAX_KEY_FILE_CONTENT) + '\n... [truncated]'
            : text;
        }
      } catch {
        // unreadable
      }
      results.push(kf);
    }

    return results;
  }

  /**
   * Detect the project type from key files.
   */
  public async detectProjectType(rootPath?: string): Promise<string | undefined> {
    const keyFiles = await this.identifyKeyFiles(rootPath);
    const fileNames = new Set(keyFiles.map((f) => f.fileName));

    if (fileNames.has('package.json')) {
      return 'node';
    }
    if (fileNames.has('pyproject.toml') || fileNames.has('requirements.txt') || fileNames.has('Pipfile')) {
      return 'python';
    }
    if (fileNames.has('Cargo.toml')) {
      return 'rust';
    }
    if (fileNames.has('go.mod')) {
      return 'go';
    }
    if (fileNames.has('Gemfile')) {
      return 'ruby';
    }
    if (fileNames.has('Makefile')) {
      return 'c-cpp';
    }

    return undefined;
  }

  /**
   * Format the full context as a structured object for the Hermes API.
   */
  public async formatForHermesApi(): Promise<HermesApiContext> {
    const ctx = await this.getContext();
    const keyFiles = await this.readKeyFileContents(ctx.projectRoot);
    const projectType = await this.detectProjectType(ctx.projectRoot);

    return {
      project: {
        root: ctx.projectRoot,
        name: ctx.projectName,
        type: projectType,
      },
      workspace: {
        folders: ctx.workspaceFolders,
        multiRoot: ctx.workspaceFolders.length > 1,
      },
      git: ctx.git,
      keyFiles,
      openFiles: ctx.openFiles,
      activeFile: ctx.activeFile,
      activeSelection: ctx.activeSelection,
      stats: {
        fileCount: ctx.fileCount,
        languages: ctx.languages,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Get a compact text representation of the current context, suitable for
   * prepending to an LLM prompt.
   */
  public async getContextSummary(): Promise<string> {
    const ctx = await this.getContext();
    const keyFiles = await this.identifyKeyFiles(ctx.projectRoot);
    const lines: string[] = [];

    if (ctx.projectRoot) {
      const projectType = await this.detectProjectType(ctx.projectRoot);
      lines.push(`Project: ${ctx.projectName} (${ctx.projectRoot})`);
      if (projectType) {
        lines.push(`Type: ${projectType}`);
      }
    }

    if (ctx.workspaceFolders.length > 1) {
      lines.push(`Workspace folders: ${ctx.workspaceFolders.length} (multi-root)`);
    }

    if (ctx.git) {
      const g = ctx.git;
      lines.push(`Git: ${g.branch} (+${g.ahead}/-${g.behind}, ${g.staged} staged, ${g.unstaged} unstaged, ${g.untracked} untracked)`);
    }

    if (keyFiles.length > 0) {
      lines.push(`Key files: ${keyFiles.map((f) => f.relativePath).join(', ')}`);
    }

    if (ctx.openFiles.length > 0) {
      lines.push(`Open files (${ctx.openFiles.length}):`);
      for (const f of ctx.openFiles) {
        lines.push(`  - ${f.relativePath} (${f.language})`);
      }
    }

    if (ctx.activeSelection) {
      const preview = ctx.activeSelection.length > 500 ? ctx.activeSelection.slice(0, 500) + '...' : ctx.activeSelection;
      lines.push(`Active selection:\n\`\`\`\n${preview}\n\`\`\``);
    }

    if (ctx.languages.length > 0) {
      lines.push(`Languages: ${ctx.languages.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Get open files as structured data.
   */
  public async getOpenFiles(rootPath?: string): Promise<ProjectFile[]> {
    const result: ProjectFile[] = [];
    const visibleEditors = vscode.window.visibleTextEditors || [];

    for (const editor of visibleEditors) {
      if (!editor.document.uri.scheme.startsWith('file')) {
        continue;
      }

      const fsPath = editor.document.uri.fsPath;
      const relativePath = rootPath ? path.relative(rootPath, fsPath) : fsPath;
      const fileName = path.basename(fsPath);

      const file: ProjectFile = {
        uri: editor.document.uri.toString(),
        fileName,
        relativePath,
        language: editor.document.languageId,
      };

      if (editor.selection && !editor.selection.isEmpty) {
        file.selection = {
          text: editor.document.getText(editor.selection),
          startLine: editor.selection.start.line + 1,
          endLine: editor.selection.end.line + 1,
        };
      }

      result.push(file);
    }

    return result;
  }

  /**
   * Get the currently active editor file.
   */
  public getActiveFile(rootPath?: string): ProjectFile | undefined {
    const active = vscode.window.activeTextEditor;
    if (!active || !active.document.uri.scheme.startsWith('file')) {
      return undefined;
    }

    const fsPath = active.document.uri.fsPath;
    const relativePath = rootPath ? path.relative(rootPath, fsPath) : fsPath;

    const file: ProjectFile = {
      uri: active.document.uri.toString(),
      fileName: path.basename(fsPath),
      relativePath,
      language: active.document.languageId,
    };

    if (active.selection && !active.selection.isEmpty) {
      file.selection = {
        text: active.document.getText(active.selection),
        startLine: active.selection.start.line + 1,
        endLine: active.selection.end.line + 1,
      };
    }

    return file;
  }

  /**
   * Get the current text selection in the active editor.
   */
  public getActiveSelection(): string | undefined {
    const active = vscode.window.activeTextEditor;
    if (!active || active.selection.isEmpty) {
      return undefined;
    }
    return active.document.getText(active.selection);
  }

  /**
   * Refresh the cached context. Debounced to avoid thrashing.
   * Fires the onDidChangeContext event after refresh.
   */
  public refresh(): void {
    this._contextCache = null;
    this._contextCacheTime = 0;
    this.invalidateKeyFilesCache();

    if (this._refreshDebounceTimer) {
      clearTimeout(this._refreshDebounceTimer);
    }

    this._refreshDebounceTimer = setTimeout(async () => {
      try {
        const apiCtx = await this.formatForHermesApi();
        this._onDidChangeContext.fire(apiCtx);
      } catch (err) {
        console.error('ProjectContextService: refresh failed', err);
      }
    }, 300);
  }

  /**
   * Invalidate the key files cache (e.g. when workspace changes).
   */
  public invalidateKeyFilesCache(): void {
    this._keyFilesCache = null;
    if (this._keyFilesCacheTimer) {
      clearTimeout(this._keyFilesCacheTimer);
      this._keyFilesCacheTimer = null;
    }
  }

  /**
   * Reset project root detection (e.g. when workspace folders change).
   */
  public resetRoot(): void {
    this._rootUri = undefined;
    this.invalidateKeyFilesCache();
    this._contextCache = null;
  }

  /**
   * Get cached context without re-scanning.
   */
  public getCachedContext(): ProjectContext | null {
    return this._contextCache;
  }

  // --- Private helpers ---

  private getStartUri(): vscode.Uri | undefined {
    if (vscode.window.activeTextEditor?.document.uri.scheme.startsWith('file')) {
      return vscode.window.activeTextEditor.document.uri;
    }
    if (vscode.workspace.workspaceFolders?.[0]) {
      return vscode.workspace.workspaceFolders[0].uri;
    }
    return undefined;
  }

  private async findProjectRoot(startPath: string): Promise<vscode.Uri | undefined> {
    const markers = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'workspace.json'];
    let current = startPath;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const marker of markers) {
        const candidate = path.join(current, marker);
        try {
          const stat = await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
          if (stat) {
            return vscode.Uri.file(current);
          }
        } catch {
          // not found
        }
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    return undefined;
  }

  private async getGitStatus(rootPath: string): Promise<GitStatus | undefined> {
    try {
      const gitApi = (vscode as any).extensions.getExtension('vscode.git');
      if (gitApi) {
        const api = await gitApi.activate();
        const apiInstance = api.getAPI(1);
        const repos = apiInstance.repositories;
        const repo = repos.find((r: any) => rootPath.startsWith(r.rootUri.fsPath));
        if (repo && repo.state) {
          const head = repo.state.HEAD;
          return {
            root: repo.rootUri.fsPath,
            branch: head?.name || 'unknown',
            staged: repo.state.indexChanges?.length || 0,
            unstaged: repo.state.workingTreeChanges?.length || 0,
            untracked: repo.state.workingTreeChanges?.filter((c: any) => c.rename === undefined && c.originalUri?.fsPath?.includes('.gitignore')).length || 0,
            ahead: head?.ahead || 0,
            behind: head?.behind || 0,
          };
        }
      }

      return await this.getGitStatusFromCommand(rootPath);
    } catch {
      return undefined;
    }
  }

  private async getGitStatusFromCommand(rootPath: string): Promise<GitStatus | undefined> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const statusOut = await execAsync('git status --porcelain -b', { cwd: rootPath }).catch(() => ({ stdout: '' }));

      const allLines = statusOut.stdout.trim().split('\n').filter((l: string) => l.length > 0);
      // Branch line: ## branch...upstream [ahead N, behind M]
      const branchLine = allLines.find((l: string) => l.startsWith('##'));
      let branch = 'unknown';
      let ahead = 0;
      let behind = 0;
      if (branchLine) {
        const branchMatch = branchLine.match(/^## (\S+?)(?:\.\.\.(\S+))?(?:\s+\[(?:ahead (\d+))?(?:,\s*)?(?:behind (\d+))?\])?$/);
        if (branchMatch) {
          branch = branchMatch[1];
          ahead = parseInt(branchMatch[3] || '0', 10);
          behind = parseInt(branchMatch[4] || '0', 10);
        }
      }

      // Status lines (skip the branch line)
      const lines = allLines.filter((l: string) => !l.startsWith('##'));

      // Porcelain format: XY filename
      // X = index status, Y = working tree status
      // Staged: X is not ' ' and not '?'
      // Unstaged: Y is not ' ' and not '?'
      // Untracked: XY = '??'
      let staged = 0;
      let unstaged = 0;
      let untracked = 0;

      for (const line of lines) {
        if (line.length < 2) continue;
        const x = line[0];
        const y = line[1];
        if (x === '?' && y === '?') {
          untracked++;
        } else {
          if (x !== ' ' && x !== '!') staged++;
          if (y !== ' ' && y !== '!') unstaged++;
        }
      }

      return {
        root: rootPath,
        branch,
        staged,
        unstaged,
        untracked,
        ahead,
        behind,
      };
    } catch {
      return undefined;
    }
  }

  private async getProjectStats(rootPath: string | undefined): Promise<{ fileCount: number; languages: string[] }> {
    if (!rootPath) {
      return { fileCount: 0, languages: [] };
    }

    try {
      const files = await vscode.workspace.findFiles(
        `**/*`,
        `{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/*.lock,**/venv/**,**/.venv/**}`,
        1000
      );
      const langs = new Set<string>();
      const extToLang: Record<string, string> = {
        '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
        '.py': 'python', '.rs': 'rust', '.go': 'go', '.rb': 'ruby', '.java': 'java',
        '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp',
        '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
        '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
        '.xml': 'xml', '.md': 'markdown', '.sh': 'shellscript', '.bash': 'shellscript',
        '.sql': 'sql', '.dockerfile': 'dockerfile', '.lua': 'lua', '.php': 'php',
        '.swift': 'swift', '.kt': 'kotlin', '.vue': 'vue', '.svelte': 'svelte',
      };
      for (const file of files) {
        const ext = '.' + (file.path.split('.').pop() || '').toLowerCase();
        const lang = extToLang[ext];
        if (lang) {
          langs.add(lang);
        }
      }
      // Dockerfile has no extension — check filename
      for (const file of files) {
        const name = file.path.split('/').pop() || '';
        if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) {
          langs.add('dockerfile');
        }
        if (name === 'Makefile') {
          langs.add('makefile');
        }
      }
      return {
        fileCount: files.length,
        languages: Array.from(langs),
      };
    } catch {
      return { fileCount: 0, languages: [] };
    }
  }
}
