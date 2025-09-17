// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

  // Create status bar item (inchangé)
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(paste) LLM Paster";
  statusBarItem.tooltip = "Open LLM Code Paster";
  statusBarItem.command = 'llm-code-paster.start';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  let disposable = vscode.commands.registerCommand('llm-code-paster.start', () => {

    const panel = vscode.window.createWebviewPanel(
      'codePaster',
      'LLM Code Paster',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // On ajoute les localResourceRoots pour autoriser l'accès aux fichiers de notre extension
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'webview'),
          vscode.Uri.joinPath(context.extensionUri, 'node_modules')
        ]
      }
    );

    // On passe le panel et le contexte à notre nouvelle fonction
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

    // Le reste de la logique de communication est presque identique
    panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'previewChanges':
            try {
              const filesToUpdate = parseInputText(message.text);
              const changes = await previewChanges(filesToUpdate);
              panel.webview.postMessage({ command: 'showPreview', changes });
            } catch (e: any) {
              vscode.window.showErrorMessage(`Error: ${e.message}`);
            }
            return;
          case 'updateFiles':
            try {
              const filesToUpdate = parseInputText(message.text);
              await applyFileUpdates(filesToUpdate, message.autoSave);
              vscode.window.showInformationMessage(`Successfully created/updated ${Object.keys(filesToUpdate).length} file(s).`);
              panel.webview.postMessage({ command: 'updateComplete' });
            } catch (e: any) {
              vscode.window.showErrorMessage(`Error: ${e.message}`);
            }
            return;
          case 'showDiff':
            try {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (!workspaceFolders) {
                throw new Error("No workspace folder open");
              }
              const rootUri = workspaceFolders[0].uri;
              const fileUri = vscode.Uri.joinPath(rootUri, message.filePath);

              // La logique pour créer un fichier temporaire et montrer le diff est complexe
              // et peut être sujette à des "race conditions".
              // Une approche plus simple est de créer un fichier temporaire dans le système de fichiers.
              // Mais nous gardons votre approche `untitled` qui est bonne.
              const tempUri = vscode.Uri.parse(`untitled:${path.join(workspaceFolders[0].uri.fsPath, message.filePath)}.new`);
              const doc = await vscode.workspace.openTextDocument(tempUri);
              const edit = new vscode.WorkspaceEdit();
              edit.insert(tempUri, new vscode.Position(0, 0), message.newContent);
              await vscode.workspace.applyEdit(edit);

              // Attendre que le document soit prêt avant de lancer le diff
              await doc.save();

              vscode.commands.executeCommand('vscode.diff', fileUri, tempUri, `${message.filePath} (Preview)`);

            } catch (e: any) {
              // On vérifie si l'erreur est que le fichier original n'existe pas.
              if (e.message.includes('cannot open')) {
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

// Les fonctions parseInputText, applyFileUpdates, previewChanges restent inchangées...
// ... (collez vos fonctions ici)
function parseInputText(text: string): { [filePath: string]: string } {
  const files: { [filePath: string]: string } = {};
  const lines = text.split(/\r?\n/);

  if (text.trim() === '') {
    return {};
  }

  const firstMeaningfulLine = lines.find(line => line.trim() !== '');
  if (!firstMeaningfulLine || !firstMeaningfulLine.startsWith('File:')) {
    throw new Error("Format invalide : Le texte doit commencer par une ligne 'File:'.");
  }

  let currentPath = '';
  let contentLines: string[] = [];
  let parsingContent = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('File: ')) {
      if (parsingContent) { // Save previous file
        files[currentPath] = contentLines.join('\n');
      }
      currentPath = line.substring('File: '.length).trim();
      if (!currentPath) {
        throw new Error(`Erreur de syntaxe à la ligne ${i + 1}: Le chemin du fichier ne peut pas être vide.`);
      }
      contentLines = [];
      parsingContent = false;
      if (i + 1 < lines.length && lines[i + 1].startsWith('Content:')) {
        parsingContent = true;
        i++; // Skip 'Content:' line
      } else {
        throw new Error(`Erreur de syntaxe à la ligne ${i + 2}: Une ligne 'File:' doit être immédiatement suivie par une ligne 'Content:'.`);
      }
    } else if (parsingContent) {
      contentLines.push(line);
    }
  }

  if (currentPath && parsingContent) {
    files[currentPath] = contentLines.join('\n');
  }


  if (Object.keys(files).length === 0) {
    throw new Error("Aucun bloc 'File:' valide n'a été trouvé. Vérifiez le format.");
  }

  return files;
}


async function applyFileUpdates(files: { [filePath: string]: string }, autoSave: boolean = true) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    throw new Error("You must have a folder open in your workspace.");
  }
  const rootUri = workspaceFolders[0].uri;

  for (const filePath in files) {
    const newContent = files[filePath];
    const fileUri = vscode.Uri.joinPath(rootUri, filePath);

    const contentUint8Array = new TextEncoder().encode(newContent);

    // Utiliser fs.writeFile est plus direct pour créer/écraser.
    await vscode.workspace.fs.writeFile(fileUri, contentUint8Array);
  }

  if (autoSave) {
    // Le writeFile ci-dessus enregistre déjà les fichiers, mais si on utilisait WorkspaceEdit,
    // la boucle de sauvegarde serait nécessaire. C'est maintenant redondant.
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

// =========================================================================
// NOUVELLE FONCTION POUR CHARGER LE HTML
// =========================================================================
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  // Chemin vers le fichier HTML sur le disque
  const htmlPath = path.join(extensionUri.fsPath, 'webview', 'index.html');
  let htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Fonction pour générer une URI sécurisée pour la webview
  const getUri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...p));

  // URIs pour nos fichiers locaux
  const scriptUri = getUri('webview', 'main.js');
  const styleUri = getUri('webview', 'style.css');
  const monacoLoaderUri = getUri('node_modules', 'monaco-editor', 'min', 'vs', 'loader.js');
  const monacoBaseUri = getUri('node_modules', 'monaco-editor', 'min', 'vs');

  // Utilisation d'un "nonce" pour la sécurité (autorise uniquement certains scripts)
  const nonce = getNonce();

  // Remplacement des placeholders dans le fichier HTML
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