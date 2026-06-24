// Caphlon VS Code Extension
export function deactivate() {}

import * as vscode from "vscode"

const TERMINAL_NAME = "caphlon"
const CAPHLON_BIN = "caphlon"

export function activate(context: vscode.ExtensionContext) {
  // ── Commands ──────────────────────────────────────────
  const openTerminal = vscode.commands.registerCommand("caphlon.openTerminal", async () => {
    const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (existing) { existing.show(); return }
    await spawnCaphlon()
  })

  const runTask = vscode.commands.registerCommand("caphlon.run", async () => {
    const prompt = await vscode.window.showInputBox({
      prompt: "What task should Caphlon run?",
      placeHolder: "e.g. Build a REST API for todos",
    })
    if (!prompt) return
    const term = ensureTerminal()
    term.sendText(`${CAPHLON_BIN} run "${prompt.replace(/"/g, '\\"')}"`)
    term.show()
  })

  const devMode = vscode.commands.registerCommand("caphlon.dev", async () => {
    const term = ensureTerminal()
    term.sendText(`${CAPHLON_BIN} dev`)
    term.show()
  })

  const designCmd = vscode.commands.registerCommand("caphlon.design", async () => {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "prototype", description: "Create a web/mobile/desktop prototype" },
        { label: "deck", description: "Create a deck/presentation" },
        { label: "image", description: "Generate an image" },
        { label: "systems", description: "List available design systems" },
      ],
      { placeHolder: "Select a design action" }
    )
    if (!choice) return
    const brief = choice.label === "systems" ? "" : await vscode.window.showInputBox({ prompt: "Describe what to design" })
    if (brief === undefined) return
    const term = ensureTerminal()
    const args = brief ? `"${brief.replace(/"/g, '\\"')}"` : ""
    term.sendText(`${CAPHLON_BIN} design ${choice.label} ${args}`)
    term.show()
  })

  const statusCmd = vscode.commands.registerCommand("caphlon.status", async () => {
    const term = ensureTerminal()
    term.sendText(`${CAPHLON_BIN} status`)
    term.show()
  })

  const doctorCmd = vscode.commands.registerCommand("caphlon.doctor", async () => {
    const term = ensureTerminal()
    term.sendText(`${CAPHLON_BIN} doctor`)
    term.show()
  })

  const composeCmd = vscode.commands.registerCommand("caphlon.compose", async () => {
    const spec = await vscode.window.showInputBox({
      prompt: "What should Caphlon compose?",
      placeHolder: "e.g. Build a REST API for todos",
    })
    if (!spec) return
    const term = ensureTerminal()
    term.sendText(`${CAPHLON_BIN} compose start "${spec.replace(/"/g, '\\"')}"`)
    term.show()
  })

  const addFileCmd = vscode.commands.registerCommand("caphlon.addFile", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) return
    const term = vscode.window.activeTerminal
    if (!term || term.name !== TERMINAL_NAME) return
    term.sendText(fileRef, false)
    term.show()
  })

  context.subscriptions.push(
    openTerminal, runTask, devMode, designCmd,
    statusCmd, doctorCmd, composeCmd, addFileCmd
  )

  // ── WebView Panel ─────────────────────────────────────
  const sidebarProvider = new CaphlonSidebarProvider(context.extensionUri)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("caphlon.dashboard", sidebarProvider)
  )

  // ── Status Bar ────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)
  statusBar.text = "$(rocket) Caphlon"
  statusBar.tooltip = "Caphlon — Unified AI Agent Platform"
  statusBar.command = "caphlon.openTerminal"
  statusBar.show()
  context.subscriptions.push(statusBar)

  // ── Helpers ───────────────────────────────────────────
  function ensureTerminal(): vscode.Terminal {
    const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (existing) return existing
    return vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
    })
  }

  async function spawnCaphlon() {
    const term = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
      location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    })
    term.show()
    term.sendText(CAPHLON_BIN)
    updateSidebar("ready")
  }

  function updateSidebar(state: string) {
    sidebarProvider.update({ state, timestamp: Date.now() })
  }

  function getActiveFile(): string | undefined {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const doc = editor.document
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri)
    if (!folder) return
    const rel = vscode.workspace.asRelativePath(doc.uri)
    let ref = `@${rel}`
    const sel = editor.selection
    if (!sel.isEmpty) {
      const sl = sel.start.line + 1
      const el = sel.end.line + 1
      ref += sl === el ? `#L${sl}` : `#L${sl}-${el}`
    }
    return ref
  }
}

// ── WebView Provider ────────────────────────────────────
class CaphlonSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView
  private _state: any = {}

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this._getHtml()

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case "run": vscode.commands.executeCommand("caphlon.run"); break
        case "dev": vscode.commands.executeCommand("caphlon.dev"); break
        case "status": vscode.commands.executeCommand("caphlon.status"); break
        case "design": vscode.commands.executeCommand("caphlon.design"); break
        case "compose": vscode.commands.executeCommand("caphlon.compose"); break
      }
    })
  }

  update(state: any) { this._state = state }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
           padding: 12px; color: var(--vscode-editor-foreground);
           background: var(--vscode-sideBar-background); }
    .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .logo span { background: linear-gradient(135deg, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .status { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 16px; padding: 8px 10px;
              background: var(--vscode-input-background); border-radius: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
    .btn-group { display: flex; flex-direction: column; gap: 6px; }
    .btn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: none; border-radius: 6px;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground);
           font-size: 13px; cursor: pointer; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.85; }
    .btn-icon { font-size: 16px; width: 20px; text-align: center; }
    .actions-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
                     opacity: 0.6; margin: 16px 0 8px; }
    .footer { margin-top: 16px; font-size: 10px; opacity: 0.4; }
  </style>
</head>
<body>
  <div class="logo"><span>⚡ Caphlon</span></div>
  <div class="status"><span class="dot"></span> Agent Ready</div>
  <div class="actions-title">Quick Actions</div>
  <div class="btn-group">
    <button class="btn" onclick="post('dev')"><span class="btn-icon">▶</span> Start Dev Mode</button>
    <button class="btn" onclick="post('run')"><span class="btn-icon">⚡</span> Run Task</button>
    <button class="btn" onclick="post('design')"><span class="btn-icon">🎨</span> Design Pipeline</button>
    <button class="btn" onclick="post('compose')"><span class="btn-icon">📋</span> Compose Workflow</button>
    <button class="btn" onclick="post('status')"><span class="btn-icon">◉</span> System Status</button>
  </div>
  <div class="footer">Caphlon v0.1.0</div>
  <script>
    const vscode = acquireVsCodeApi();
    function post(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`
  }
}
