#!/usr/bin/env node
/**
 * scaffold-vsix.js
 * ─────────────────────────────────────────────────────────────────────
 * Run this ONCE from your project root to scaffold the VS Code
 * Webview Extension wrapper around your Vite/React build.
 *
 * Usage:
 *   node scaffold-vsix.js
 *
 * After running, follow the printed steps to package the .vsix file.
 * ─────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const EXT_DIR  = path.join(ROOT, 'vscode-extension');
const SRC_DIR  = path.join(EXT_DIR, 'src');
const MEDIA    = path.join(EXT_DIR, 'media');

// ── Helpers ────────────────────────────────────────────────────────────────
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✅  ${path.relative(ROOT, filePath)}`);
}

console.log('\n🔧  Scaffolding VS Code Webview Extension...\n');

// ── 1. package.json (extension manifest) ──────────────────────────────────
write(path.join(EXT_DIR, 'package.json'), JSON.stringify({
  name: "socraticdev-studio",
  displayName: "SocraticDev Studio (PRO)",
  description: "AI-powered Socratic coding mentor — Concept Hints, Code Skeletons & guided learning via Groq.",
  version: "1.0.0",
  publisher: "socraticdev",
  engines: { vscode: "^1.85.0" },
  categories: ["Education", "Programming Languages", "Other"],
  icon: "media/icon.png",
  activationEvents: ["onCommand:socraticdev.openPanel"],
  main: "./out/extension.js",
  contributes: {
    commands: [{
      command: "socraticdev.openPanel",
      title: "Open SocraticDev Studio",
      icon: "$(lightbulb)"
    }],
    menus: {
      "editor/title": [{
        command: "socraticdev.openPanel",
        group: "navigation"
      }]
    },
    keybindings: [{
      command: "socraticdev.openPanel",
      key: "ctrl+shift+s",
      mac: "cmd+shift+s"
    }]
  },
  scripts: {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  devDependencies: {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "@vscode/vsce": "^2.22.0"
  }
}, null, 2));

// ── 2. tsconfig.json ───────────────────────────────────────────────────────
write(path.join(EXT_DIR, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    module: "commonjs",
    target: "ES2020",
    outDir: "out",
    lib: ["ES2020"],
    sourceMap: true,
    rootDir: "src",
    strict: true
  },
  exclude: ["node_modules", ".vscode-test"]
}, null, 2));

// ── 3. .vscodeignore ───────────────────────────────────────────────────────
write(path.join(EXT_DIR, '.vscodeignore'),
`.vscode/**
.vscode-test/**
src/**
.gitignore
.yarnrc
webpack.config.js
vsc-extension-quickstart.md
**/tsconfig.json
**/eslint.config.mjs
**/*.map
**/*.ts
!out/**
!media/**
`);

// ── 4. .gitignore ──────────────────────────────────────────────────────────
write(path.join(EXT_DIR, '.gitignore'), 'node_modules/\nout/\n*.vsix\n');

// ── 5. extension.ts (the host) ─────────────────────────────────────────────
write(path.join(SRC_DIR, 'extension.ts'), `import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('SocraticDev Studio is now active!');

  context.subscriptions.push(
    vscode.commands.registerCommand('socraticdev.openPanel', () => {
      if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
        return;
      }

      panel = vscode.window.createWebviewPanel(
        'socraticdevStudio',
        'SocraticDev Studio (PRO)',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          // Allow loading resources from the media folder
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'media'))
          ]
        }
      );

      panel.iconPath = vscode.Uri.file(
        path.join(context.extensionPath, 'media', 'icon.png')
      );

      panel.webview.html = getWebviewContent(panel.webview, context);

      // Forward messages from the webview (optional telemetry / state sync)
      panel.webview.onDidReceiveMessage(
        (message) => {
          switch (message.command) {
            case 'showInfo':
              vscode.window.showInformationMessage(message.text);
              break;
            case 'insertCode':
              insertCodeIntoActiveEditor(message.code);
              break;
          }
        },
        undefined,
        context.subscriptions
      );

      panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    })
  );
}

function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const mediaDir = path.join(context.extensionPath, 'media');
  const indexPath = path.join(mediaDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    return \`<!DOCTYPE html><html><body>
      <h2 style="color:red;font-family:sans-serif;padding:20px;">
        ⚠️ Build not found.<br>
        Run: <code>npm run build</code> in the project root,<br>
        then copy the <code>dist/</code> contents into <code>vscode-extension/media/</code>
      </h2>
    </body></html>\`;
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Rewrite all asset paths so they work inside the VS Code Webview sandbox
  html = html.replace(
    /(src|href)=["']\\/([^"']+)["']/g,
    (match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(mediaDir, assetPath))
      );
      return \`\${attr}="\${assetUri}"\`;
    }
  );

  // Inject VS Code CSP + webview API bridge
  const cspMeta = \`<meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    font-src https://fonts.gstatic.com \${webview.cspSource};
    style-src 'unsafe-inline' https://fonts.googleapis.com \${webview.cspSource};
    script-src 'unsafe-inline' \${webview.cspSource};
    connect-src https://api.groq.com;
    img-src data: \${webview.cspSource};
  ">\`;

  const vscodeApiScript = \`<script>
    // Expose VS Code Webview API to the React app (optional)
    window.__VSCODE_API__ = typeof acquireVsCodeApi !== 'undefined'
      ? acquireVsCodeApi()
      : null;
  </script>\`;

  html = html.replace('<head>', \`<head>\n  \${cspMeta}\`);
  html = html.replace('</head>', \`  \${vscodeApiScript}\\n</head>\`);

  return html;
}

async function insertCodeIntoActiveEditor(code: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await editor.edit(edit => {
    const pos = editor.selection.active;
    edit.insert(pos, code);
  });
}

export function deactivate() {}
`);

console.log('\n✨  Extension files scaffolded successfully!\n');
console.log('═══════════════════════════════════════════════════════════');
console.log('📦  HOW TO BUILD & PACKAGE YOUR .vsix FILE');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('STEP 1 — Build the Vite/React app:');
console.log('  (in project root)');
console.log('  npm run build\n');
console.log('STEP 2 — Copy the build into the extension media folder:');
console.log('  xcopy /E /I dist\\* vscode-extension\\media\\\n');
console.log('  (or on macOS/Linux):');
console.log('  cp -r dist/* vscode-extension/media/\n');
console.log('STEP 3 — Add your Groq API key to the built index.html:');
console.log('  Open vscode-extension/media/index.html and make sure');
console.log('  VITE_AI_API_KEY is baked into your bundle.');
console.log('  (Vite does this automatically from .env during "npm run build")\n');
console.log('STEP 4 — Install extension dependencies & TypeScript:');
console.log('  cd vscode-extension');
console.log('  npm install\n');
console.log('STEP 5 — Compile the TypeScript extension host:');
console.log('  npx tsc -p ./\n');
console.log('STEP 6 — Create a placeholder icon (if you don\'t have one):');
console.log('  Place a 128x128 PNG at: vscode-extension/media/icon.png\n');
console.log('STEP 7 — Package into a .vsix:');
console.log('  npx @vscode/vsce package\n');
console.log('STEP 8 — Install the .vsix directly in VS Code:');
console.log('  Press Ctrl+Shift+P → "Extensions: Install from VSIX..."');
console.log('  Select the generated socraticdev-studio-1.0.0.vsix file\n');
console.log('STEP 9 — Open the panel:');
console.log('  Press Ctrl+Shift+S  OR');
console.log('  Ctrl+Shift+P → "Open SocraticDev Studio"\n');
console.log('═══════════════════════════════════════════════════════════');
console.log('🎉  You\'re ready to demo inside real VS Code!\n');
