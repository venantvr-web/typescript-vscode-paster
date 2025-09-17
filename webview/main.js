// webview/main.js
(function () {
    const vscode = acquireVsCodeApi();

    // On récupère l'URI de base pour Monaco depuis l'attribut data que nous avons ajouté
    const monacoBaseUri = document.currentScript.dataset.monacoBaseUri;

    require.config({ paths: { 'vs': monacoBaseUri } });

    require(['vs/editor/editor.main'], function () {
        const editor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: 'File: src/components/NewComponent.js\nContent:\n// your code here\n\nFile: src/styles/style.css\nContent:\n/* CSS here */',
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

        // Le reste de votre script est identique
        monaco.languages.register({ id: 'llm-paste' });
        monaco.languages.setMonarchTokensProvider('llm-paste', {
            tokenizer: {
                root: [
                    [/^File:.*$/, 'keyword'],
                    [/^Content:.*$/, 'type'],
                    [/\/\/.*$/, 'comment'],
                    [/\/\*[\s\S]*?\*\//, 'comment'],
                    [/#.*$/, 'comment'],
                    [/"[^"]*"/, 'string'],
                    [/'[^']*'/, 'string'],
                    [/\b(function|const|let|var|if|else|return|class|export|import)\b/, 'keyword'],
                ]
            }
        });
        monaco.editor.setModelLanguage(editor.getModel(), 'llm-paste');


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
                newFiles.forEach(change => fileChangesList.appendChild(createFileItem(change)));
            }

            if (modifiedFiles.length > 0) {
                const header = document.createElement('h3');
                header.textContent = 'Modified Files (' + modifiedFiles.length + ')';
                header.style.marginTop = '20px';
                header.style.marginBottom = '10px';
                fileChangesList.appendChild(header);
                modifiedFiles.forEach(change => fileChangesList.appendChild(createFileItem(change)));
            }
        }

        function createFileItem(change) {
            const li = document.createElement('li');
            li.className = 'file-item';

            const pathDiv = document.createElement('div');
            pathDiv.className = 'file-path';

            const icon = document.createElement('span');
            icon.textContent = change.action === 'create' ? '➕' : '✏️';
            icon.style.marginRight = '8px';

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
            stats.textContent = lines + (lines > 1 ? ' lines' : ' line');

            if (change.action === 'modify') {
                const oldLines = change.oldContent.split('\n').length;
                const diff = lines - oldLines;
                const diffText = diff > 0 ? `+${diff}` : String(diff);
                stats.textContent += ` (${diffText})`;
            }

            li.appendChild(pathDiv);
            li.appendChild(stats);

            // Click to show diff
            if (change.action === 'modify') {
                li.classList.add('can-diff');
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
})();