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

export class ProjectContextService {
  private _rootUri: vscode.Uri | undefined;
  private _contextCache: ProjectContext | null = null;
  private _cacheTimer: NodeJS.Timeout | null = null;

  constructor() {}

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

    return this._contextCache;
  }

  /**
   * Get a compact text representation of the current context, suitable for
   * prepending to an LLM prompt.
   */
  public async getContextSummary(): Promise<string> {
    const ctx = await this.getContext();
    const lines: string[] = [];

    if (ctx.projectRoot) {
      lines.push(`Project: ${ctx.projectName} (${ctx.projectRoot})`);
    }

    if (ctx.workspaceFolders.length > 0) {
      lines.push(`Workspace folders: ${ctx.workspaceFolders.length}`);
    }

    if (ctx.git) {
      const g = ctx.git;
      lines.push(`Git: ${g.branch} (+${g.ahead}/-${g.behind}, ${g.staged} staged, ${g.unstaged} unstaged, ${g.untracked} untracked)`);
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
   * Refresh the cached context. Call this when files change.
   */
  public refresh(): void {
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

      // Fallback: spawn git command
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

      const [branchOut, statusOut, countOut] = await Promise.all([
        execAsync('git rev-parse --abbrev-ref HEAD', { cwd: rootPath }).catch(() => ({ stdout: 'unknown' })),
        execAsync('git status --porcelain', { cwd: rootPath }).catch(() => ({ stdout: '' })),
        execAsync('git status --porcelain', { cwd: rootPath }).catch(() => ({ stdout: '' })),
      ]);

      const lines = statusOut.stdout.trim().split('\n').filter((l: string) => l.length > 0);
      const staged = lines.filter((l: string) => /^[A-Z]/.test(l) && l[1] !== ' ').length;
      const unstaged = lines.filter((l: string) => /^[A-Z]/.test(l) && l[1] === ' ').length;
      const untracked = lines.filter((l: string) => l.startsWith('??')).length;

      let ahead = 0;
      let behind = 0;
      try {
        const diverge = await execAsync('git rev-parse --short @{upstream} 2>/dev/null && git log --oneline @{upstream}..HEAD | wc -l && git log --oneline HEAD..@{upstream} | wc -l', { cwd: rootPath });
        const nums = diverge.stdout.trim().split('\n').map(Number);
        if (nums.length >= 2) {
          ahead = nums[1] || 0;
          behind = nums[2] || 0;
        }
      } catch {
        // no upstream
      }

      return {
        root: rootPath,
        branch: branchOut.stdout.trim(),
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
      for (const file of files) {
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          langs.add(doc.languageId);
        } catch {
          // binary or unreadable
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
