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

              // Create temp file with new content
              const tempUri = vscode.Uri.parse(`untitled:${message.filePath}.new`);
              await vscode.workspace.openTextDocument(tempUri).then(async (doc) => {
                const edit = new vscode.WorkspaceEdit();
                edit.insert(tempUri, new vscode.Position(0, 0), message.newContent);
                await vscode.workspace.applyEdit(edit);

                // Show diff
                vscode.commands.executeCommand('vscode.diff', fileUri, tempUri, `${message.filePath} ← Changes`);
              });
            } catch (e: any) {
              vscode.window.showErrorMessage(`Error showing diff: ${e.message}`);
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
      const doc = await vscode.workspace.openTextDocument(fileUri);
      fileExists = true;
      oldContent = doc.getText();
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

        /* Preview modal styles */
        .modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
        }

        .modal-content {
          background-color: var(--vscode-editor-background);
          margin: 5% auto;
          padding: 20px;
          border: 1px solid var(--vscode-panel-border);
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          border-radius: 4px;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .close {
          color: var(--vscode-foreground);
          font-size: 28px;
          font-weight: bold;
          cursor: pointer;
        }

        .close:hover {
          opacity: 0.7;
        }

        .file-changes {
          list-style: none;
          padding: 0;
        }

        .file-item {
          padding: 10px;
          margin-bottom: 10px;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 3px;
          cursor: pointer;
        }

        .file-item:hover {
          background-color: var(--vscode-list-hoverBackground);
        }

        .file-path {
          font-weight: bold;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .file-status {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
        }

        .status-new {
          background-color: var(--vscode-gitDecoration-addedResourceForeground);
          color: var(--vscode-editor-background);
        }

        .status-modified {
          background-color: var(--vscode-gitDecoration-modifiedResourceForeground);
          color: var(--vscode-editor-background);
        }

        .file-stats {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          margin-top: 5px;
        }

        .modal-footer {
          margin-top: 20px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
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
        <button id="preview-button" class="secondary">Preview Changes</button>
        <button id="update-button">Apply Changes</button>
      </div>

      <!-- Preview Modal -->
      <div id="previewModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Preview Changes</h2>
            <span class="close" id="closeModal">&times;</span>
          </div>
          <div id="previewContent">
            <ul class="file-changes" id="fileChangesList"></ul>
          </div>
          <div class="modal-footer">
            <button id="cancelPreview" class="secondary">Cancel</button>
            <button id="applyChanges">Apply All Changes</button>
          </div>
        </div>
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
          const previewButton = document.getElementById('preview-button');
          const autoSaveCheckbox = document.getElementById('auto-save');
          const modal = document.getElementById('previewModal');
          const closeModal = document.getElementById('closeModal');
          const cancelPreview = document.getElementById('cancelPreview');
          const applyChanges = document.getElementById('applyChanges');
          const fileChangesList = document.getElementById('fileChangesList');

          let currentChanges = [];

          previewButton.addEventListener('click', () => {
            const text = editor.getValue();
            vscode.postMessage({
              command: 'previewChanges',
              text: text
            });
          });

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

          // Modal controls
          closeModal.onclick = () => {
            modal.style.display = 'none';
          };

          cancelPreview.onclick = () => {
            modal.style.display = 'none';
          };

          applyChanges.onclick = () => {
            const text = editor.getValue();
            const autoSave = autoSaveCheckbox.checked;
            vscode.postMessage({
              command: 'updateFiles',
              text: text,
              autoSave: autoSave
            });
            modal.style.display = 'none';
          };

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'showPreview':
                currentChanges = message.changes;
                displayPreview(message.changes);
                modal.style.display = 'block';
                break;
              case 'updateComplete':
                modal.style.display = 'none';
                break;
            }
          });

          function displayPreview(changes) {
            fileChangesList.innerHTML = '';

            const newFiles = changes.filter(c => c.action === 'create');
            const modifiedFiles = changes.filter(c => c.action === 'modify');

            if (newFiles.length > 0) {
              const header = document.createElement('h3');
              header.textContent = 'New Files (' + newFiles.length + ')';
              header.style.marginBottom = '10px';
              fileChangesList.appendChild(header);

              newFiles.forEach(change => {
                const li = createFileItem(change);
                fileChangesList.appendChild(li);
              });
            }

            if (modifiedFiles.length > 0) {
              const header = document.createElement('h3');
              header.textContent = 'Modified Files (' + modifiedFiles.length + ')';
              header.style.marginTop = '20px';
              header.style.marginBottom = '10px';
              fileChangesList.appendChild(header);

              modifiedFiles.forEach(change => {
                const li = createFileItem(change);
                fileChangesList.appendChild(li);
              });
            }
          }

          function createFileItem(change) {
            const li = document.createElement('li');
            li.className = 'file-item';

            const pathDiv = document.createElement('div');
            pathDiv.className = 'file-path';

            const icon = document.createElement('span');
            icon.textContent = change.action === 'create' ? '➕' : '✏️';

            const path = document.createElement('span');
            path.textContent = change.filePath;

            const status = document.createElement('span');
            status.className = 'file-status status-' + (change.action === 'create' ? 'new' : 'modified');
            status.textContent = change.action === 'create' ? 'NEW' : 'MODIFIED';

            pathDiv.appendChild(icon);
            pathDiv.appendChild(path);
            pathDiv.appendChild(status);

            const stats = document.createElement('div');
            stats.className = 'file-stats';
            const lines = change.newContent.split('\n').length;
            stats.textContent = lines + ' lines';

            if (change.action === 'modify') {
              const oldLines = change.oldContent.split('\n').length;
              const diff = lines - oldLines;
              const diffText = diff > 0 ? '+' + diff : String(diff);
              stats.textContent += ' (' + diffText + ' lines)';
            }

            li.appendChild(pathDiv);
            li.appendChild(stats);

            // Click to show diff
            if (change.action === 'modify') {
              li.style.cursor = 'pointer';
              li.title = 'Click to view diff';
              li.onclick = () => {
                vscode.postMessage({
                  command: 'showDiff',
                  filePath: change.filePath,
                  newContent: change.newContent
                });
              };
            }

            return li;
          }

          // Auto-focus editor
          editor.focus();
        });
      </script>
  </body>
  </html>`;
}