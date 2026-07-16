import { execFile } from 'child_process'
import { promisify } from 'util'
import { FIXED_PORT, isValidListenPort } from './ports'

const execFileAsync = promisify(execFile)

function parsePortInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const port = Number(trimmed)
  return isValidListenPort(port) ? port : null
}

function suggestAlternatePort(busyPort: number): number {
  if (busyPort >= 1 && busyPort < 65535) {
    return busyPort + 1
  }
  return busyPort === FIXED_PORT ? 12322 : FIXED_PORT
}

function buildPromptHtml(busyPort: number, defaultPort: number, channel: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MediaChips</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 20px 22px 24px;
      background: Canvas;
      color: CanvasText;
    }
    h1 { font-size: 16px; margin: 0 0 8px; font-weight: 600; }
    p { margin: 0 0 16px; opacity: 0.85; }
    label { display: block; margin-bottom: 6px; font-weight: 500; }
    input {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
      background: Field;
      color: FieldText;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
    }
    button {
      font: inherit;
      padding: 7px 14px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
      background: color-mix(in srgb, CanvasText 8%, Canvas);
      color: CanvasText;
      cursor: pointer;
    }
    button.primary {
      background: #0a84ff;
      border-color: #0a84ff;
      color: white;
    }
  </style>
</head>
<body>
  <h1>Port ${busyPort} is already in use</h1>
  <p>Another application is using this port. Enter a different port for MediaChips.</p>
  <label for="port">Port</label>
  <input id="port" type="number" min="1" max="65535" value="${defaultPort}" autofocus />
  <div class="actions">
    <button type="button" id="quit">Quit</button>
    <button type="button" class="primary" id="use">Use Port</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron')
    const input = document.getElementById('port')
    const submit = (value) => ipcRenderer.invoke(${JSON.stringify(channel)}, value)
    document.getElementById('quit').onclick = () => submit(null)
    document.getElementById('use').onclick = () => submit(String(input.value || ''))
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit(String(input.value || ''))
      if (event.key === 'Escape') submit(null)
    })
    input.focus()
    input.select()
  </script>
</body>
</html>`
}

async function promptPortViaElectronWindow(
  busyPort: number,
  defaultPort: number,
): Promise<string | null> {
  if (!process.versions.electron) {
    return null
  }

  const electron = require('electron') as typeof import('electron')
  const {app: electronApp, BrowserWindow, ipcMain} = electron

  if (!electronApp.isReady()) {
    await electronApp.whenReady()
  }

  const channel = `mediachips:port-prompt:${Date.now()}:${Math.random().toString(36).slice(2)}`

  return new Promise((resolve) => {
    let settled = false
    let win: import('electron').BrowserWindow | null = null

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      try {
        ipcMain.removeHandler(channel)
      } catch {
        // ignore
      }
      if (win && !win.isDestroyed()) {
        win.removeAllListeners('closed')
        win.close()
      }
      resolve(value)
    }

    ipcMain.handle(channel, (_event, value: unknown) => {
      if (value == null) {
        finish(null)
        return null
      }
      finish(String(value))
      return null
    })

    win = new BrowserWindow({
      width: 460,
      height: 300,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      center: true,
      show: false,
      title: 'MediaChips',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    })

    win.setMenuBarVisibility(false)
    win.once('ready-to-show', () => {
      if (!win || win.isDestroyed()) return
      win.show()
      win.focus()
      try {
        if (process.platform === 'darwin') {
          electronApp.focus({steal: true})
        } else {
          electronApp.focus()
        }
      } catch {
        // ignore focus failures
      }
    })
    win.on('closed', () => finish(null))

    const html = buildPromptHtml(busyPort, defaultPort, channel)
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })
}

async function promptPortDarwin(busyPort: number, defaultPort: number): Promise<string | null> {
  const script = [
    'tell application "System Events"',
    'activate',
    `set dialogResult to display dialog "Port ${busyPort} is already in use by another application." & return & return & "Enter a different port:" default answer "${defaultPort}" with title "MediaChips" buttons {"Quit", "Use Port"} default button "Use Port" cancel button "Quit"`,
    'return text returned of dialogResult',
    'end tell',
  ].join('\n')

  try {
    const {stdout} = await execFileAsync('osascript', ['-e', script], {timeout: 600000})
    return stdout.trim()
  } catch (err: unknown) {
    console.error('osascript port prompt failed:', err)
    return null
  }
}

async function promptPortWindows(busyPort: number, defaultPort: number): Promise<string | null> {
  const message = `Port ${busyPort} is already in use by another application.\\r\\n\\r\\nEnter a different port:`
  const ps = [
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    `$result = [Microsoft.VisualBasic.Interaction]::InputBox("${message}", "MediaChips", "${defaultPort}")`,
    'Write-Output $result',
  ].join('; ')

  try {
    const {stdout} = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      {timeout: 600000, windowsHide: true},
    )
    const value = stdout.replace(/\r?\n$/, '').trim()
    return value === '' ? null : value
  } catch (err: unknown) {
    console.error('PowerShell port prompt failed:', err)
    return null
  }
}

async function promptPortLinux(busyPort: number, defaultPort: number): Promise<string | null> {
  const text = `Port ${busyPort} is already in use by another application.\n\nEnter a different port:`

  try {
    const {stdout} = await execFileAsync(
      'zenity',
      ['--entry', '--title=MediaChips', `--text=${text}`, `--entry-text=${defaultPort}`],
      {timeout: 600000},
    )
    return stdout.trim()
  } catch {
    // fall through to kdialog
  }

  try {
    const {stdout} = await execFileAsync(
      'kdialog',
      ['--title', 'MediaChips', '--inputbox', text, String(defaultPort)],
      {timeout: 600000},
    )
    return stdout.trim()
  } catch (err: unknown) {
    console.error('Linux port prompt failed:', err)
    return null
  }
}

async function promptPortInput(busyPort: number, defaultPort: number): Promise<string | null> {
  if (!process.versions.electron) {
    return null
  }

  // Prefer an Electron window — native osascript dialogs often appear behind
  // Electron or fail without Accessibility permissions on macOS.
  try {
    const viaWindow = await promptPortViaElectronWindow(busyPort, defaultPort)
    if (viaWindow != null) {
      return viaWindow
    }
    // null can mean the user cancelled; do not fall through to another dialog.
    return null
  } catch (err: unknown) {
    console.error('Electron port prompt window failed, trying native dialog:', err)
  }

  if (process.platform === 'darwin') {
    return promptPortDarwin(busyPort, defaultPort)
  }
  if (process.platform === 'win32') {
    return promptPortWindows(busyPort, defaultPort)
  }
  return promptPortLinux(busyPort, defaultPort)
}

export {
  parsePortInput,
  suggestAlternatePort,
  promptPortInput,
}
