import * as vscode from 'vscode';
import { HermesSidebarProvider } from './sidebarProvider';
import { ProjectContextService } from './projectContext';
import { TerminalService } from './terminalService';

let projectContextService: ProjectContextService;
let terminalService: TerminalService;

export function activate(context: vscode.ExtensionContext) {
    // Initialize project context service
    projectContextService = new ProjectContextService();
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(() => projectContextService.refresh()),
        vscode.workspace.onDidCloseTextDocument(() => projectContextService.refresh()),
        vscode.workspace.onDidSaveTextDocument(() => projectContextService.refresh()),
    );

    // Initialize terminal service
    terminalService = TerminalService.getInstance();
    context.subscriptions.push({
        dispose: () => terminalService.dispose(),
    });

    // Detect hermes CLI path
    terminalService.detectHermesPath().then(path => {
        console.log(`Hermes CLI detected at: ${path}`);
    }).catch(err => {
        console.error('Failed to detect Hermes CLI:', err);
    });

    // Register sidebar webview
    const sidebarProvider = new HermesSidebarProvider(context.extensionUri, projectContextService);
    sidebarProvider.setTerminalService(terminalService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            HermesSidebarProvider.viewType,
            sidebarProvider
        )
    );

    // Wire terminal service events to sidebar
    terminalService.on('output', (data: any) => {
        sidebarProvider.sendTerminalOutput(data);
    });
    terminalService.on('complete', (data: any) => {
        sidebarProvider.sendTerminalOutput(data);
    });
    terminalService.on('error', (data: any) => {
        sidebarProvider.sendTerminalOutput(data);
    });

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

    // Register predefined Hermes commands
    for (const cmd of TerminalService.PREDEFINED_COMMANDS) {
        context.subscriptions.push(
            vscode.commands.registerCommand(cmd.id, async () => {
                // Show output channel
                terminalService.getOutputChannel().show(true);

                const output = await terminalService.executeCommand(cmd.command, cmd.args);

                if (output.exitCode === 0) {
                    vscode.window.showInformationMessage(
                        `${cmd.title} completed successfully`
                    );
                } else {
                    vscode.window.showWarningMessage(
                        `${cmd.title} failed with code ${output.exitCode}`
                    );
                }

                return output;
            })
        );
    }

    // Command to run custom Hermes command
    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.runCommand', async () => {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter Hermes command (e.g. status, kanban list, sessions list)',
                placeHolder: 'hermes status',
                value: 'hermes ',
            });

            if (!input || !input.trim()) {
                return;
            }

            // Strip 'hermes ' prefix if user included it
            const cleanInput = input.trim().startsWith('hermes ')
                ? input.trim().slice(7)
                : input.trim();

            const parts = cleanInput.split(/\s+/);
            const command = parts[0];
            const args = parts.slice(1);

            // Show output channel
            terminalService.getOutputChannel().show(true);

            const output = await terminalService.executeCommand(command, args);

            if (output.exitCode === 0) {
                vscode.window.showInformationMessage(
                    `Command "${command} ${args.join(' ')}" completed`
                );
            } else {
                vscode.window.showWarningMessage(
                    `Command failed with code ${output.exitCode}`
                );
            }

            return output;
        })
    );

    // Command to open Hermes output channel
    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.showOutput', () => {
            terminalService.getOutputChannel().show();
        })
    );

    console.log('Hermes Cursor Extension v0.1.0 activated with sidebar, project context, and terminal');
}

export function deactivate() {
    console.log('Hermes Cursor Extension deactivated');
}
