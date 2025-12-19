"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
let currentPanel = undefined;
let audioProcess = undefined;
function playAudio(audioPath) {
    // Kill any existing audio
    if (audioProcess) {
        audioProcess.kill();
    }
    const platform = process.platform;
    let command;
    if (platform === 'win32') {
        // Windows - use PowerShell
        command = `powershell -c "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"`;
    }
    else if (platform === 'darwin') {
        // macOS
        command = `afplay "${audioPath}"`;
    }
    else {
        // Linux - try common players
        command = `ffplay -nodisp -autoexit "${audioPath}" 2>/dev/null || mpv --no-video "${audioPath}" 2>/dev/null || paplay "${audioPath}" 2>/dev/null || aplay "${audioPath}" 2>/dev/null`;
    }
    audioProcess = (0, child_process_1.exec)(command, (error) => {
        if (error) {
            console.log('Audio playback error:', error.message);
        }
    });
}
function stopAudio() {
    if (audioProcess) {
        audioProcess.kill();
        audioProcess = undefined;
    }
}
function activate(context) {
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
        const disposable = vscode.commands.registerCommand(`elden-code-pushed.${cmd}`, async (...args) => {
            try {
                // Execute the original git push command
                await vscode.commands.executeCommand(cmd, ...args);
                // Show the overlay after successful push
                showCodePushedOverlay(context);
            }
            catch (error) {
                // If push fails, don't show overlay but rethrow
                throw error;
            }
        });
        context.subscriptions.push(disposable);
    });
    // Watch for git operations using the Git extension API
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension) {
        gitExtension.activate().then((git) => {
            const api = git.getAPI(1);
            api.repositories.forEach((repo) => {
                setupRepoWatcher(repo, context);
            });
            api.onDidOpenRepository((repo) => {
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
function setupRepoWatcher(repo, context) {
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
function showCodePushedOverlay(context) {
    // If panel already exists, just reveal it
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        return;
    }
    // Create webview panel
    currentPanel = vscode.window.createWebviewPanel('gitPushed', 'GIT PUSHED', {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false
    }, {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'media')
        ]
    });
    // Get the image URI for webview
    const imageUri = currentPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'code_pushed.png'));
    // Get the actual file path for audio (to play via system)
    const audioPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'elden_ring_you_died_sound_effect.mp3').fsPath;
    // Play audio via system
    playAudio(audioPath);
    currentPanel.webview.html = getWebviewContent(imageUri);
    // Auto-close after animation (8 seconds to match audio)
    setTimeout(() => {
        if (currentPanel) {
            currentPanel.dispose();
        }
    }, 8000);
    // Handle messages from the webview (for click/keypress dismissal)
    currentPanel.webview.onDidReceiveMessage(message => {
        if (message.command === 'dismiss') {
            stopAudio();
            if (currentPanel) {
                currentPanel.dispose();
            }
        }
    }, undefined, context.subscriptions);
    currentPanel.onDidDispose(() => {
        stopAudio();
        currentPanel = undefined;
    });
}
function getWebviewContent(imageUri) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GIT PUSHED</title>
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
            animation: fadeInOut 8s ease-in-out forwards;
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
            10% {
                opacity: 1;
            }
            85% {
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
            <img src="${imageUri}" alt="GIT PUSHED" />
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        
        function dismiss() {
            vscode.postMessage({ command: 'dismiss' });
        }
        
        // Dismiss on click anywhere
        document.addEventListener('click', dismiss);
        
        // Dismiss on any key press
        document.addEventListener('keydown', dismiss);
    </script>
</body>
</html>`;
}
function deactivate() {
    stopAudio();
    if (currentPanel) {
        currentPanel.dispose();
    }
}
//# sourceMappingURL=extension.js.map