import * as path from 'path';
import * as vscode from 'vscode';

export interface WorkspaceFile {
  uri: vscode.Uri;
  fsPath: string;
  relativePath: string;
  fileName: string;
  language?: string;
  size?: number;
}

/**
 * Service for navigating between files in the workspace from the Hermes extension.
 * Supports opening files, revealing them in the explorer, and listing workspace files.
 */
export class FileNavigationService {
  private _projectRoot: string | undefined;

  constructor() {}

  /**
   * Set the detected project root path.
   */
  public setProjectRoot(rootPath: string | undefined): void {
    this._projectRoot = rootPath;
  }

  /**
   * Open a file in the active editor at a given line and character column.
   * Returns whether the file was opened successfully.
   */
  public async openFile(
    filePath: string,
    options?: {
      line?: number;
      character?: number;
      preserveFocus?: boolean;
      preview?: boolean;
      viewColumn?: vscode.ViewColumn;
    }
  ): Promise<boolean> {
    try {
      const uri = this.resolveUri(filePath);
      if (!uri) {
        return false;
      }

      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, {
        preview: options?.preview ?? true,
        preserveFocus: options?.preserveFocus ?? true,
        viewColumn: options?.viewColumn ?? vscode.ViewColumn.Active,
      });

      // If line/character provided, reveal the range
      if (options?.line !== undefined) {
        const line = Math.max(0, options.line - 1); // 1-indexed to 0-indexed
        const character = Math.max(0, (options.character ?? 1) - 1);
        const position = new vscode.Position(line, character);
        const range = new vscode.Range(position, position);
        vscode.window.activeTextEditor?.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reveal a file in the VS Code Explorer sidebar (file tree).
   */
  public async revealInExplorer(filePath: string): Promise<boolean> {
    try {
      const uri = this.resolveUri(filePath);
      if (!uri) {
        return false;
      }

      await vscode.commands.executeCommand('revealInExplorer', uri);

      // Fallback: use the built-in open command on the explorer view
      await vscode.commands.executeCommand('workbench.actions.files.revealInExplorer', uri);
      return true;
    } catch {
      // Some versions of VS Code don't have revealInExplorer; try alternative
      try {
        const uri = this.resolveUri(filePath);
        if (uri) {
          await vscode.commands.executeCommand('workbench.view.explorer');
          await vscode.commands.executeCommand('list.find', uri);
        }
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Open a file by its vscode file:// URI string (e.g. from a link in chat).
   * Handles optional #line and #line,col fragments.
   */
  public async openFromUri(uriString: string): Promise<boolean> {
    try {
      // Parse file:// URI with optional #Lline:col or #line fragment
      const match = uriString.match(/^(file:\/\/.+?)(?:#(?:L)?(\d+)(?::(\d+))?)?$/);
      if (!match) {
        return false;
      }

      const [, filePath, lineStr, charStr] = match;
      const decodedPath = decodeURIComponent(filePath);
      const line = lineStr ? parseInt(lineStr, 10) : undefined;
      const character = charStr ? parseInt(charStr, 10) : undefined;

      return await this.openFile(decodedPath, { line, character });
    } catch {
      return false;
    }
  }

  /**
   * Get all currently visible/open text editors as workspace files.
   */
  public getOpenFiles(): WorkspaceFile[] {
    const result: WorkspaceFile[] = [];

    for (const editor of vscode.window.visibleTextEditors) {
      if (!editor.document.uri.scheme.startsWith('file')) {
        continue;
      }

      result.push({
        uri: editor.document.uri,
        fsPath: editor.document.uri.fsPath,
        relativePath: this.toRelative(editor.document.uri.fsPath),
        fileName: path.basename(editor.document.uri.fsPath),
        language: editor.document.languageId,
      });
    }

    return result;
  }

  /**
   * Get the currently active file.
   */
  public getActiveFile(): WorkspaceFile | undefined {
    const active = vscode.window.activeTextEditor;
    if (!active || !active.document.uri.scheme.startsWith('file')) {
      return undefined;
    }

    return {
      uri: active.document.uri,
      fsPath: active.document.uri.fsPath,
      relativePath: this.toRelative(active.document.uri.fsPath),
      fileName: path.basename(active.document.uri.fsPath),
      language: active.document.languageId,
    };
  }

  /**
   * List files in the workspace, optionally filtered by glob pattern.
   * Returns up to `limit` files sorted by modification time (newest first).
   */
  public async listWorkspaceFiles(
    includePattern?: string,
    excludePattern?: string,
    limit: number = 200
  ): Promise<WorkspaceFile[]> {
    const root = this._projectRoot
      ? vscode.Uri.file(this._projectRoot)
      : vscode.workspace.workspaceFolders?.[0]?.uri;

    if (!root) {
      return [];
    }

    const include = includePattern ?? '**/*';
    const exclude =
      excludePattern ??
      '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/venv/**,**/.venv/**,**/*.pyc}';

    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(root, include),
      new vscode.RelativePattern(root, exclude),
      limit
    );

    const result: WorkspaceFile[] = [];
    for (const fileUri of files) {
      let size: number | undefined;
      try {
        const stat = await vscode.workspace.fs.stat(fileUri);
        size = stat.size;
      } catch {
        // ignore
      }
      result.push({
        uri: fileUri,
        fsPath: fileUri.fsPath,
        relativePath: this.toRelative(fileUri.fsPath),
        fileName: path.basename(fileUri.fsPath),
        size: size,
      });
    }

    return result;
  }

  /**
   * Search for files matching a query string (by name or path).
   */
  public async searchFiles(query: string, limit: number = 20): Promise<WorkspaceFile[]> {
    const allFiles = await this.listWorkspaceFiles(undefined, undefined, 1000);
    const lowerQuery = query.toLowerCase();

    return allFiles
      .filter(
        (f) =>
          f.fileName.toLowerCase().includes(lowerQuery) ||
          f.relativePath.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  /**
   * Switch to the next/previous open editor.
   */
  public async switchEditor(direction: 'next' | 'previous'): Promise<void> {
    if (direction === 'next') {
      await vscode.commands.executeCommand('workbench.action.nextEditor');
    } else {
      await vscode.commands.executeCommand('workbench.action.previousEditor');
    }
  }

  /**
   * Quick open file picker with optional filter.
   */
  public async quickOpen(filter?: string): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.quickOpen', filter ?? '');
  }

  /**
   * Go to file in workspace (VS Code's native "Go to File").
   */
  public async goToFile(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.quickOpen');
  }

  /**
   * Parse a file reference from text. Supports formats:
   * - /absolute/path/to/file.ts
   * - relative/path/to/file.ts
   * - file.ts
   * - path/to/file.ts:42 (with line number)
   * - file:///absolute/path/to/file.ts
   */
  public parseFileReference(text: string): { path: string; line?: number; character?: number } | null {
    // Match file paths in text — looks for common patterns
    const fileRegex = /(?:^|\s|\[)(\/[^:\s\]]+|[^:\s\]]+\.\w+)(?::(\d+))(?::(\d+))?(?=\]|\s|$)/g;
    const match = fileRegex.exec(text);

    if (match) {
      return {
        path: match[1],
        line: match[2] ? parseInt(match[2], 10) : undefined,
        character: match[3] ? parseInt(match[3], 10) : undefined,
      };
    }
    return null;
  }

  /**
   * Extract all file references from a block of text (e.g. a chat message).
   */
  public extractFileReferences(text: string): { path: string; line?: number; character?: number }[] {
    const results: { path: string; line?: number; character?: number }[] = [];
    const fileRegex = new RegExp('(?:^|\\s|\\[|`)(\\/[^):\\s`\\]]+|[^):\\s`\\]]+\\.\\w{2,5})(?::(\\d+))(?::(\\d+))?(?=[\\]`])', 'g');

    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1];
      // Filter out obvious non-file matches
      if (
        filePath.includes('/') ||
        filePath.match(/\.\w{2,5}$/)
      ) {
        results.push({
          path: filePath,
          line: match[2] ? parseInt(match[2], 10) : undefined,
          character: match[3] ? parseInt(match[3], 10) : undefined,
        });
      }
    }

    return results;
  }

  // --- Private helpers ---

  /**
   * Resolve a file path string to a vscode.Uri.
   * Handles absolute paths, relative paths (relative to project root), and file:// URIs.
   */
  private resolveUri(filePath: string): vscode.Uri | undefined {
    // file:// URI
    if (filePath.startsWith('file://')) {
      const stripped = filePath.replace(/#.*$/, ''); // remove fragment
      return vscode.Uri.parse(stripped);
    }

    // Absolute path
    if (path.isAbsolute(filePath)) {
      return vscode.Uri.file(filePath);
    }

    // Relative path — resolve against project root or workspace
    const basePath =
      this._projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (basePath) {
      return vscode.Uri.file(path.join(basePath, filePath));
    }

    return undefined;
  }

  /**
   * Convert an absolute path to a relative one (relative to project root).
   */
  private toRelative(fsPath: string): string {
    const root = this._projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      return path.relative(root, fsPath);
    }
    return fsPath;
  }
}
