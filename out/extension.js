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
    // Get the actual file path for audio (to play via system)
    const audioPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'elden_ring_you_died_sound_effect.mp3').fsPath;
    // Play audio via system
    playAudio(audioPath);
    currentPanel.webview.html = getWebviewContent('GIT PUSHED');
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
function getWebviewContent(text) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${text}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 100vw;
            height: 100vh;
            background: #1a1a1a;
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
            background: linear-gradient(
                to bottom,
                #1a1a1a 0%,
                #252525 40%,
                #252525 60%,
                #1a1a1a 100%
            );
            display: flex;
            justify-content: center;
            align-items: center;
            animation: fadeInOut 8s ease-in-out forwards;
        }
        
        .dark-band {
            position: absolute;
            width: 100%;
            height: 120px;
            background: linear-gradient(
                to bottom,
                transparent 0%,
                rgba(20, 20, 20, 0.9) 20%,
                rgba(15, 15, 15, 1) 50%,
                rgba(20, 20, 20, 0.9) 80%,
                transparent 100%
            );
        }
        
        .text-container {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 40px 80px;
            animation: scaleIn 0.8s ease-out forwards;
        }
        
        .sheen {
            position: absolute;
            width: 100%;
            height: 100%;
            background: radial-gradient(
                ellipse 60% 50% at 50% 50%,
                rgba(180, 140, 60, 0.4) 0%,
                rgba(160, 120, 40, 0.2) 30%,
                rgba(140, 100, 20, 0.1) 50%,
                transparent 70%
            );
            filter: blur(15px);
            animation: sheenPulse 3s ease-in-out infinite;
        }
        
        .text {
            position: relative;
            font-family: 'Adobe Garamond Pro', 'Cormorant Garamond', 'Garamond', 'Times New Roman', serif;
            font-size: 4.5rem;
            font-weight: 400;
            color: #d4af37;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            text-shadow: 
                0 0 10px rgba(212, 175, 55, 0.8),
                0 0 20px rgba(212, 175, 55, 0.6),
                0 0 40px rgba(212, 175, 55, 0.4),
                0 0 60px rgba(212, 175, 55, 0.2),
                0 2px 4px rgba(0, 0, 0, 0.8);
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
        
        @keyframes sheenPulse {
            0%, 100% {
                opacity: 0.8;
                transform: scale(1);
            }
            50% {
                opacity: 1;
                transform: scale(1.05);
            }
        }
    </style>
</head>
<body>
    <div class="overlay">
        <div class="dark-band"></div>
        <div class="text-container">
            <div class="sheen"></div>
            <span class="text">${text}</span>
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