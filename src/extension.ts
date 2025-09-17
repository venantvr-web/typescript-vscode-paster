import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	// Create status bar item
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
			{ enableScripts: true }
		);

		panel.webview.html = getWebviewContent();

		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'updateFiles':
						try {
							const filesToUpdate = parseInputText(message.text);
							await applyFileUpdates(filesToUpdate, message.autoSave);
							vscode.window.showInformationMessage(`Successfully created/updated ${Object.keys(filesToUpdate).length} file(s).`);
						} catch (e: any) {
							vscode.window.showErrorMessage(`Error: ${e.message}`);
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

	for (let i = 0; i < lines.length; i++) {
		const currentLine = lines[i];

		if (currentLine.startsWith('File: ')) {
			if (i + 1 >= lines.length || !lines[i + 1].startsWith('Content:')) {
				throw new Error(`Erreur de syntaxe à la ligne ${i + 2}: Une ligne 'File:' doit être immédiatement suivie par une ligne 'Content:'.`);
			}

			const path = currentLine.substring('File: '.length).trim();
			if (!path) {
				throw new Error(`Erreur de syntaxe à la ligne ${i + 1}: Le chemin du fichier ne peut pas être vide.`);
			}

			const contentLines = [];
			let contentIndex = i + 2;
			while (contentIndex < lines.length && !lines[contentIndex].startsWith('File: ')) {
				contentLines.push(lines[contentIndex]);
				contentIndex++;
			}

			files[path] = contentLines.join('\n');
			i = contentIndex - 1;
		}
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
	const workspaceEdit = new vscode.WorkspaceEdit();

	for (const filePath in files) {
		const newContent = files[filePath];
		const fileUri = vscode.Uri.joinPath(rootUri, filePath);
		workspaceEdit.createFile(fileUri, { overwrite: true, ignoreIfExists: false });
		workspaceEdit.insert(fileUri, new vscode.Position(0, 0), newContent);
	}

	const success = await vscode.workspace.applyEdit(workspaceEdit);
	if (!success) {
		throw new Error("Failed to apply file edits.");
	}

	if (autoSave) {
		for (const filePath in files) {
			const fileUri = vscode.Uri.joinPath(rootUri, filePath);
			const doc = await vscode.workspace.openTextDocument(fileUri);
			await doc.save();
		}
	}
}

function getWebviewContent() {
	return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>LLM Code Paster</title>
      <style>
        body { font-family: var(--vscode-font-family); background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
        textarea { width: 95%; height: 75vh; border: 1px solid var(--vscode-input-border); background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: var(--vscode-editor-font-family); }
        button { margin-top: 10px; padding: 5px 15px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
        button:hover { background: var(--vscode-button-hoverBackground); }
      </style>
  </head>
  <body>
      <h1>Paste Your Code Snippet</h1>
      <textarea id="code-input" placeholder="File: src/components/NewComponent.js\nContent:\n// your code here"></textarea>
      <br>
      <label style="display: block; margin-top: 10px;">
        <input type="checkbox" id="auto-save" checked> Auto-save files after update
      </label>
      <button id="update-button">Create / Update Files</button>
      
      <script>
        const vscode = acquireVsCodeApi();
        const updateButton = document.getElementById('update-button');
        const codeInput = document.getElementById('code-input');
        const autoSaveCheckbox = document.getElementById('auto-save');

        updateButton.addEventListener('click', () => {
          const text = codeInput.value;
          const autoSave = autoSaveCheckbox.checked;
          vscode.postMessage({
            command: 'updateFiles',
            text: text,
            autoSave: autoSave
          });
        });
      </script>
  </body>
  </html>`;
}