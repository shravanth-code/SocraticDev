import * as vscode from 'vscode';
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
    return `<!DOCTYPE html><html><body>
      <h2 style="color:red;font-family:sans-serif;padding:20px;">
        ⚠️ Build not found.<br>
        Run: <code>npm run build</code> in the project root,<br>
        then copy the <code>dist/</code> contents into <code>vscode-extension/media/</code>
      </h2>
    </body></html>`;
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Rewrite all asset paths so they work inside the VS Code Webview sandbox
  html = html.replace(
    /(src|href)=["']\/([^"']+)["']/g,
    (match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(mediaDir, assetPath))
      );
      return `${attr}="${assetUri}"`;
    }
  );

  // Inject VS Code CSP + webview API bridge (supports Monaco Editor & Groq API)
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    font-src https://fonts.gstatic.com https://cdn.jsdelivr.net ${webview.cspSource};
    style-src 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net ${webview.cspSource};
    script-src 'unsafe-inline' 'unsafe-eval' ${webview.cspSource} https://cdn.jsdelivr.net;
    worker-src blob:;
    child-src blob:;
    connect-src https://api.groq.com https://cdn.jsdelivr.net;
    img-src data: https: ${webview.cspSource};
  ">`;

  const vscodeApiScript = `<script>
    // Expose VS Code Webview API to the React app (optional)
    window.__VSCODE_API__ = typeof acquireVsCodeApi !== 'undefined'
      ? acquireVsCodeApi()
      : null;
  </script>`;

  html = html.replace('<head>', `<head>
  ${cspMeta}`);
  html = html.replace('</head>', `  ${vscodeApiScript}\n</head>`);

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
