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
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
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
        body {
          font-family: var(--vscode-font-family);
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          padding: 20px;
          margin: 0;
        }

        h1 {
          font-size: 1.5em;
          margin-bottom: 15px;
          font-weight: 500;
        }

        #editor-container {
          width: 100%;
          height: 70vh;
          border: 1px solid var(--vscode-input-border);
          border-radius: 3px;
          overflow: hidden;
        }

        #monaco-editor {
          width: 100%;
          height: 100%;
        }

        .controls {
          margin-top: 15px;
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-grow: 1;
        }

        button {
          padding: 8px 16px;
          border: 1px solid var(--vscode-button-border);
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          cursor: pointer;
          border-radius: 2px;
          font-size: 13px;
        }

        button:hover {
          background: var(--vscode-button-hoverBackground);
        }

        button.secondary {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        input[type="checkbox"] {
          cursor: pointer;
        }
      </style>
  </head>
  <body>
      <h1>📋 LLM Code Paster</h1>

      <div id="editor-container">
        <div id="monaco-editor"></div>
      </div>

      <div class="controls">
        <div class="checkbox-container">
          <input type="checkbox" id="auto-save" checked>
          <label for="auto-save">Auto-save files after update</label>
        </div>
        <button id="clear-button" class="secondary">Clear</button>
        <button id="update-button">Create / Update Files</button>
      </div>

      <script src="https://unpkg.com/monaco-editor@0.44.0/min/vs/loader.js"></script>
      <script>
        const vscode = acquireVsCodeApi();

        require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@0.44.0/min/vs' }});

        require(['vs/editor/editor.main'], function() {
          const editor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: 'File: src/components/NewComponent.js\\nContent:\\n// your code here\\n\\nFile: src/styles/style.css\\nContent:\\n/* CSS here */',
            language: 'plaintext',
            theme: document.body.classList.contains('vscode-dark') ? 'vs-dark' :
                   document.body.classList.contains('vscode-light') ? 'vs' : 'vs-dark',
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false
          });

          // Define custom language for syntax highlighting
          monaco.languages.register({ id: 'llm-paste' });
          monaco.languages.setMonarchTokensProvider('llm-paste', {
            tokenizer: {
              root: [
                [/^File:.*$/, 'keyword'],
                [/^Content:.*$/, 'type'],
                [/\\/\\/.*$/, 'comment'],
                [/\\/\\*[\\s\\S]*?\\*\\//, 'comment'],
                [/#.*$/, 'comment'],
                [/"[^"]*"/, 'string'],
                [/'[^']*'/, 'string'],
                [/\\b(function|const|let|var|if|else|return|class|export|import)\\b/, 'keyword'],
              ]
            }
          });

          editor.getModel().setLanguage('llm-paste');

          const updateButton = document.getElementById('update-button');
          const clearButton = document.getElementById('clear-button');
          const autoSaveCheckbox = document.getElementById('auto-save');

          updateButton.addEventListener('click', () => {
            const text = editor.getValue();
            const autoSave = autoSaveCheckbox.checked;
            vscode.postMessage({
              command: 'updateFiles',
              text: text,
              autoSave: autoSave
            });
          });

          clearButton.addEventListener('click', () => {
            editor.setValue('');
            editor.focus();
          });

          // Auto-focus editor
          editor.focus();
        });
      </script>
  </body>
  </html>`;
}