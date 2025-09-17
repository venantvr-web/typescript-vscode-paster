# LLM Code Paster

Instantly paste and apply multi-file code snippets from LLMs into your VSCode workspace.

## What it does

LLM Code Paster streamlines the workflow of applying code suggestions from AI assistants like ChatGPT, Claude, or Copilot. Simply paste structured code output and the extension automatically creates or updates multiple files at once.

## How to use

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `LLM Paste and Replace Code`
3. Paste your LLM-generated code in the format:
   ```
   File: path/to/file.js
   Content:
   // Your code here

   File: another/file.py
   Content:
   # More code here
   ```
4. Click "Create / Update Files"
5. Files are instantly created/updated with optional auto-save

## Features

- **Batch file operations** - Create or update multiple files in one action
- **Smart parsing** - Automatically detects file paths and content blocks
- **Auto-save option** - Toggle automatic saving of modified files
- **Workspace integration** - Works seamlessly with your current VSCode workspace
- **Error handling** - Clear feedback on parsing errors or invalid formats

## Format Example

```
File: src/components/Button.tsx
Content:
export const Button = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>
}

File: src/styles/button.css
Content:
.button {
  padding: 10px 20px;
  border-radius: 4px;
}
```

## Installation

1. Install from VSCode Marketplace or from VSIX file
2. Open any workspace folder
3. Start using with `LLM Paste and Replace Code` command

## Requirements

- VSCode 1.80.0 or higher
- Active workspace folder

## License

MIT