import path from 'path'
import type {BrowserWindow, WebContents} from 'electron'

export function buildRendererUrl({
  port,
  search = '',
}: {
  port: number
  search?: string
}): string {
  const suffix = search
    ? (search.startsWith('?') ? search : `?${search}`)
    : ''
  return `http://localhost:${port}/${suffix}`
}

export function buildLoadingPageUrl({
  appRoot,
  useViteDevServer,
}: {
  appRoot: string
  useViteDevServer: boolean
}): string {
  const file = useViteDevServer ? 'public/loading.html' : 'dist/loading.html'
  return `file://${path.join(appRoot, file)}`
}

export function clampZoomFactor(factor: unknown): number {
  return Math.min(3, Math.max(0.5, Number(factor) || 1))
}

export function createWaitForBackend(deps: {
  getPort: () => number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  logWarn?: (message: string) => void
}) {
  const fetchImpl = deps.fetchImpl || fetch
  const sleep = deps.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const logWarn = deps.logWarn || ((message: string) => console.warn(message))

  return async function waitForBackend(port: number, timeoutMs = 30000): Promise<void> {
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY

    while (Date.now() < deadline) {
      // Only treat the backend as ready after /api/ping succeeds. `server.listener`
      // is assigned when listen() is called, which can be before the port is bound
      // and before config.port is written — racing that left the UI on a stale port.
      const currentPort = deps.getPort() || port

      try {
        const response = await fetchImpl(`http://127.0.0.1:${currentPort}/api/ping`)
        if (response.ok) return
      } catch {}

      await sleep(200)
    }

    logWarn(`Backend not ready on port ${deps.getPort() || port} after ${timeoutMs}ms; loading renderer anyway`)
  }
}

export function createZoomController() {
  let suppressZoomChangedEvent = false

  function bindZoomChangedListener(browserWindow: BrowserWindow) {
    if (!browserWindow || browserWindow.isDestroyed()) return

    const {webContents} = browserWindow

    webContents.on('before-input-event', (event: Electron.Event, input: Electron.Input) => {
      if (
        input.type === 'gesturePinchBegin'
        || input.type === 'gesturePinchUpdate'
        || input.type === 'gesturePinchEnd'
      ) {
        event.preventDefault()
      }
    })

    try {
      webContents.setVisualZoomLevelLimits(1, 1)
    } catch {}

    webContents.on('zoom-changed', () => {
      if (suppressZoomChangedEvent) return
      browserWindow.webContents.send('zoom-changed', browserWindow.webContents.getZoomFactor())
    })
  }

  function setWebContentsZoomFactor(webContents: WebContents, factor: unknown) {
    if (!webContents || webContents.isDestroyed()) return 1

    const clamped = clampZoomFactor(factor)
    suppressZoomChangedEvent = true
    webContents.setZoomFactor(clamped)
    suppressZoomChangedEvent = false
    return clamped
  }

  return {
    bindZoomChangedListener,
    setWebContentsZoomFactor,
  }
}

export function sendConfigToWindow(
  browserWindow: BrowserWindow | null,
  config: unknown,
) {
  if (!browserWindow || browserWindow.isDestroyed()) return
  browserWindow.webContents.send('config', config)
}

export function bindRendererLoadRetry(
  webContents: WebContents,
  getUrl: () => string,
  {
    useViteDevServer,
    waitForBackend,
    getPort,
  }: {
    useViteDevServer: boolean
    waitForBackend: (port: number, timeoutMs?: number) => Promise<void>
    getPort: () => number
  },
) {
  webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || useViteDevServer || webContents.isDestroyed()) return

    void (async () => {
      await waitForBackend(getPort(), 10000)
      if (webContents.isDestroyed()) return
      await webContents.loadURL(getUrl())
    })()
  })
}
