import * as vscode from 'vscode';
import * as path from 'path';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Elden Code Pushed is now active!');

    // Register test command
    const testCommand = vscode.commands.registerCommand('elden-code-pushed.testOverlay', () => {
        showCodePushedOverlay(context);
    });

    // Intercept git push commands from the Git extension
    const gitPushCommands = [
        'git.push',
        'git.pushTo',
        'git.pushForce',
        'git.pushWithTags',
        'git.pushForceWithLease'
    ];

    gitPushCommands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(
            `elden-code-pushed.${cmd}`,
            async (...args: any[]) => {
                try {
                    // Execute the original git push command
                    await vscode.commands.executeCommand(cmd, ...args);
                    // Show the overlay after successful push
                    showCodePushedOverlay(context);
                } catch (error) {
                    // If push fails, don't show overlay but rethrow
                    throw error;
                }
            }
        );
        context.subscriptions.push(disposable);
    });

    // Watch for git operations using the Git extension API
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension) {
        gitExtension.activate().then((git) => {
            const api = git.getAPI(1);
            
            api.repositories.forEach((repo: any) => {
                setupRepoWatcher(repo, context);
            });

            api.onDidOpenRepository((repo: any) => {
                setupRepoWatcher(repo, context);
            });
        });
    }

    // Also watch terminal for git push commands
    const terminalWatcher = vscode.window.onDidEndTerminalShellExecution(async (e) => {
        const commandLine = e.execution.commandLine;
        if (commandLine && typeof commandLine.value === 'string') {
            const cmd = commandLine.value.toLowerCase();
            if (cmd.includes('git push') && e.exitCode === 0) {
                showCodePushedOverlay(context);
            }
        }
    });

    context.subscriptions.push(testCommand, terminalWatcher);
}

function setupRepoWatcher(repo: any, context: vscode.ExtensionContext) {
    let previousAhead = repo.state.HEAD?.ahead ?? 0;
    
    repo.state.onDidChange(() => {
        const currentAhead = repo.state.HEAD?.ahead ?? 0;
        // If we had commits ahead and now we don't, a push likely happened
        if (previousAhead > 0 && currentAhead === 0) {
            showCodePushedOverlay(context);
        }
        previousAhead = currentAhead;
    });
}

function showCodePushedOverlay(context: vscode.ExtensionContext) {
    // If panel already exists, just reveal it
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    // Create webview panel
    currentPanel = vscode.window.createWebviewPanel(
        'codePushed',
        'CODE PUSHED',
        {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false
        },
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        }
    );

    // Get the image URI
    const imageUri = currentPanel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'code_pushed.png')
    );

    currentPanel.webview.html = getWebviewContent(imageUri);

    // Auto-close after animation
    setTimeout(() => {
        if (currentPanel) {
            currentPanel.dispose();
        }
    }, 4000);

    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
    });
}

function getWebviewContent(imageUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CODE PUSHED</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 100vw;
            height: 100vh;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            animation: fadeInOut 4s ease-in-out forwards;
        }
        
        .image-container {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: scaleIn 0.8s ease-out forwards;
        }
        
        .image-container img {
            max-width: 100%;
            height: auto;
            filter: drop-shadow(0 0 30px rgba(200, 160, 60, 0.5));
        }
        
        @keyframes fadeInOut {
            0% {
                opacity: 0;
            }
            15% {
                opacity: 1;
            }
            75% {
                opacity: 1;
            }
            100% {
                opacity: 0;
            }
        }
        
        @keyframes scaleIn {
            0% {
                transform: scale(0.9);
                opacity: 0;
            }
            100% {
                transform: scale(1);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="overlay">
        <div class="image-container">
            <img src="${imageUri}" alt="CODE PUSHED" />
        </div>
    </div>
</body>
</html>`;
}

export function deactivate() {
    if (currentPanel) {
        currentPanel.dispose();
    }
}
