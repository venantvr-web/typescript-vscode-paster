// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// =========================================================================
// 1. On crée notre "serveur de fichiers virtuel" (Content Provider)
// =========================================================================
class DiffContentProvider implements vscode.TextDocumentContentProvider {
    // onDidChange est requis par l'interface, mais nous n'en avons pas besoin ici.
    public onDidChange?: vscode.Event<vscode.Uri> | undefined;

    // C'est ici qu'on stockera le nouveau contenu des fichiers à prévisualiser.
    // La clé est le chemin du fichier (ex: "src/index.ts"), la valeur est le contenu.
    public newContent = new Map<string, string>();

    // C'est la méthode que VS Code appellera quand il verra une URI avec notre schéma.
    provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
        // On récupère le contenu correspondant au chemin du fichier depuis notre Map.
        return this.newContent.get(uri.path);
    }
}


export function activate(context: vscode.ExtensionContext) {

    // =========================================================================
    // 2. On instancie et on enregistre notre Provider au démarrage.
    // =========================================================================
    const diffProvider = new DiffContentProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('llm-paster-preview', diffProvider)
    );

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(paste) LLM Paster";
    statusBarItem.tooltip = "Open LLM Code Paster";
    statusBarItem.command = 'typescript-vscode-paster.start';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    let disposable = vscode.commands.registerCommand('typescript-vscode-paster.start', () => {

        const panel = vscode.window.createWebviewPanel(
            'codePaster',
            'LLM Code Paster',
            vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'webview'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules')
                ]
            }
        );

        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {

                    case 'previewChanges':
                        try {
                            const filesToUpdate = parseInputText(message.text);

                            // =========================================================================
                            // 3. On met à jour notre Provider avec le contenu le plus récent.
                            // =========================================================================
                            diffProvider.newContent.clear(); // On vide l'ancien contenu
                            for (const filePath in filesToUpdate) {
                                diffProvider.newContent.set(filePath, filesToUpdate[filePath]);
                            }

                            const changes = await previewChanges(filesToUpdate);
                            panel.webview.postMessage({command: 'showPreview', changes});
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Error parsing for preview: ${e.message}`);
                        }
                        return;

                    case 'updateFiles':
                        try {
                            const filesToUpdate = parseInputText(message.text);
                            if (Object.keys(filesToUpdate).length === 0) {
                                vscode.window.showWarningMessage("No files to update. Check the input format.");
                                return;
                            }
                            await applyFileUpdates(filesToUpdate);
                            vscode.window.showInformationMessage(`Successfully created/updated ${Object.keys(filesToUpdate).length} file(s).`);
                            panel.webview.postMessage({command: 'updateComplete'});
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Error updating files: ${e.message}`);
                        }
                        return;

                    case 'showDiff':
                        try {
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            if (!workspaceFolders) {
                                throw new Error("No workspace folder open");
                            }

                            // Côté GAUCHE du diff : le fichier original sur le disque.
                            const originalFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, message.filePath);

                            // =========================================================================
                            // 4. On crée une URI avec notre schéma personnalisé.
                            // =========================================================================
                            const newContentUri = vscode.Uri.parse(`llm-paster-preview:${message.filePath}`);

                            // On lance la commande de diff. VS Code va automatiquement appeler notre Provider
                            // pour obtenir le contenu de `newContentUri`.
                            await vscode.commands.executeCommand(
                                'vscode.diff',
                                originalFileUri,
                                newContentUri,
                                `${message.filePath} (Preview)`
                            );

                        } catch (e: any) {
                            if (e.message && e.message.includes('cannot open')) {
                                vscode.window.showInformationMessage("Cannot show diff for a new file.");
                            } else {
                                vscode.window.showErrorMessage(`Error showing diff: ${e.message}`);
                            }
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

// Les fonctions ci-dessous restent inchangées.

function parseInputText(text: string): { [filePath: string]: string } {
    const files: { [filePath: string]: string } = {};
    const lines = text.split(/\r?\n/);

    if (text.trim() === '') {
        return {};
    }

    const firstMeaningfulLine = lines.find(line => line.trim() !== '');
    if (!firstMeaningfulLine || !firstMeaningfulLine.startsWith('File:')) {
        throw new Error("Invalid Format: Text must start with a 'File:' line.");
    }

    let currentPath = '';
    let contentLines: string[] = [];
    let isParsingContent = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('File:')) {
            if (isParsingContent) {
                files[currentPath] = contentLines.join('\n');
            }
            currentPath = line.substring('File:'.length).trim();
            if (!currentPath) {
                throw new Error(`Syntax Error at line ${i + 1}: File path cannot be empty.`);
            }
            contentLines = [];
            isParsingContent = false;

            if (i + 1 < lines.length && lines[i + 1].startsWith('Content:')) {
                isParsingContent = true;
                i++;
            } else {
                files[currentPath] = '';
            }
        } else if (isParsingContent) {
            contentLines.push(line);
        }
    }

    if (currentPath && isParsingContent) {
        files[currentPath] = contentLines.join('\n');
    }

    if (Object.keys(files).length === 0) {
        throw new Error("No valid 'File:' blocks were found. Please check the format.");
    }

    return files;
}

async function applyFileUpdates(files: { [filePath: string]: string }) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("You must have a folder open in your workspace.");
    }
    const rootUri = workspaceFolders[0].uri;

    for (const filePath in files) {
        const fileUri = vscode.Uri.joinPath(rootUri, filePath);
        const newContent = files[filePath];
        const contentUint8Array = new TextEncoder().encode(newContent);

        await vscode.workspace.fs.writeFile(fileUri, contentUint8Array);
    }
}

async function previewChanges(files: { [filePath: string]: string }): Promise<any[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("You must have a folder open in your workspace.");
    }
    const rootUri = workspaceFolders[0].uri;
    const changes = [];

    for (const filePath in files) {
        const fileUri = vscode.Uri.joinPath(rootUri, filePath);
        let fileExists = false;
        let oldContent = '';

        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            oldContent = new TextDecoder().decode(content);
            fileExists = true;
        } catch {
            fileExists = false;
        }

        changes.push({
            filePath,
            fileExists,
            oldContent,
            newContent: files[filePath],
            action: fileExists ? 'modify' : 'create'
        });
    }

    return changes;
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const htmlPath = path.join(extensionUri.fsPath, 'webview', 'index.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    const getUri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...p));

    const scriptUri = getUri('webview', 'main.js');
    const styleUri = getUri('webview', 'style.css');
    const monacoLoaderUri = getUri('node_modules', 'monaco-editor', 'min', 'vs', 'loader.js');
    const monacoBaseUri = getUri('node_modules', 'monaco-editor', 'min', 'vs');
    const nonce = getNonce();

    htmlContent = htmlContent
        .replace(/{{cspSource}}/g, webview.cspSource)
        .replace(/{{nonce}}/g, nonce)
        .replace(/{{styleUri}}/g, styleUri.toString())
        .replace(/{{scriptUri}}/g, scriptUri.toString())
        .replace(/{{monacoLoaderUri}}/g, monacoLoaderUri.toString())
        .replace(/{{monacoBaseUri}}/g, monacoBaseUri.toString());

    return htmlContent;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}