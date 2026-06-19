import * as vscode from 'vscode';
import { HermesSidebarProvider } from './sidebarProvider';
import { ProjectContextService } from './projectContext';
import { TerminalService } from './terminalService';
import { FileNavigationService } from './fileNavigation';
import { ChatService } from './chatService';

let projectContextService: ProjectContextService;
let terminalService: TerminalService;
let fileNavigationService: FileNavigationService;
let chatService: ChatService;

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

    // Initialize file navigation service
    fileNavigationService = new FileNavigationService();

    // Initialize chat service
    chatService = ChatService.getInstance();
    chatService.initStorage(context.globalState);
    chatService.setProjectContext(projectContextService);
    context.subscriptions.push({
        dispose: () => chatService.dispose(),
    });

    // Detect hermes CLI for chat
    chatService.detectHermesPath().then(available => {
        if (available) {
            sidebarProvider.updateChatStatus('ready');
        } else {
            sidebarProvider.updateChatStatus('no-cli');
        }
    });

    // Wire chat service events to sidebar
    chatService.on('message', (data: any) => {
        sidebarProvider.sendChatMessage(data);
    });
    chatService.on('stream', (data: any) => {
        sidebarProvider.sendChatStream(data);
    });
    chatService.on('complete', (data: any) => {
        sidebarProvider.sendChatComplete(data);
    });
    chatService.on('error', (data: any) => {
        sidebarProvider.sendChatError(data);
    });

    // Sync project root with file navigation
    projectContextService.detectProjectRoot().then((rootUri) => {
        if (rootUri) {
            fileNavigationService.setProjectRoot(rootUri.fsPath);
        }
    });
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(() => {
            projectContextService.refresh();
            projectContextService.detectProjectRoot().then((rootUri) => {
                if (rootUri) {
                    fileNavigationService.setProjectRoot(rootUri.fsPath);
                }
            });
        }),
    );

    // Detect hermes CLI path
    terminalService.detectHermesPath().then(path => {
        console.log(`Hermes CLI detected at: ${path}`);
    }).catch(err => {
        console.error('Failed to detect Hermes CLI:', err);
    });

    // Register sidebar webview
    const sidebarProvider = new HermesSidebarProvider(context.extensionUri, projectContextService, fileNavigationService);
    sidebarProvider.setTerminalService(terminalService);
    sidebarProvider.setChatService(chatService);
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

    // File navigation commands
    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.file.open', async (filePath?: string) => {
            if (!filePath) {
                filePath = await vscode.window.showInputBox({
                    prompt: 'Enter file path (absolute or relative to project root)',
                    placeHolder: 'src/extension.ts or /absolute/path/to/file.ts',
                });
            }
            if (!filePath) return;

            const opened = await fileNavigationService.openFile(filePath);
            if (!opened) {
                vscode.window.showWarningMessage(`Could not open file: ${filePath}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.file.reveal', async (filePath?: string) => {
            if (!filePath) {
                filePath = await vscode.window.showInputBox({
                    prompt: 'Enter file path to reveal in Explorer',
                    placeHolder: 'src/extension.ts',
                });
            }
            if (!filePath) return;

            const revealed = await fileNavigationService.revealInExplorer(filePath);
            if (!revealed) {
                vscode.window.showWarningMessage(`Could not reveal file: ${filePath}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.file.quickSwitch', async () => {
            await fileNavigationService.quickOpen();
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

    console.log('Hermes Cursor Extension v0.1.0 activated with sidebar, chat, project context, terminal, and file navigation');
}

export function deactivate() {
    console.log('Hermes Cursor Extension deactivated');
}
