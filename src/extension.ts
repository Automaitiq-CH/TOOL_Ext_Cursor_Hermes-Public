import * as vscode from 'vscode';
import { HermesSidebarProvider } from './sidebarProvider';
import { ProjectContextService } from './projectContext';

let projectContextService: ProjectContextService;

export function activate(context: vscode.ExtensionContext) {
    // Initialize project context service
    projectContextService = new ProjectContextService();
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(() => projectContextService.refresh()),
        vscode.workspace.onDidCloseTextDocument(() => projectContextService.refresh()),
        vscode.workspace.onDidSaveTextDocument(() => projectContextService.refresh()),
    );

    // Register sidebar webview
    const sidebarProvider = new HermesSidebarProvider(context.extensionUri, projectContextService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            HermesSidebarProvider.viewType,
            sidebarProvider
        )
    );

    // Open sidebar command
    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.openSidebar', () => {
            vscode.commands.executeCommand('hermesSidebar.focus');
        })
    );

    // Command to inspect project context (debug)
    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.inspectContext', async () => {
            const summary = await projectContextService.getContextSummary();
            vscode.window.showInformationMessage(summary);
        })
    );

    console.log('Hermes Cursor Extension v0.1.0 activated with sidebar and project context');
}

export function deactivate() {
    console.log('Hermes Cursor Extension deactivated');
}
