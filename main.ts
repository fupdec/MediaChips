import type { BrowserWindow as BrowserWindowInstance, WebContents, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog,
  shell,
  screen,
  Notification,
} from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { machineId } from 'node-machine-id'

import { apiErrorMessage } from './api/types/errors'
import { initAppUpdater } from './electron/autoUpdater'
import { normalizeMediaPath } from './api/utils/normalizeUserPath'
import { resolveExistingPath } from './api/services/contentHash'
import { saveConfigFile } from './app/server/configFile'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function ellipsizeDragTitle(title: string, maxWidthPx: number, fontSize: number): string {
  const text = String(title || 'Media').trim() || 'Media'
  // Approx advance for system UI semi-bold; keeps titles from overflowing the title bar.
  const avgAdvance = fontSize * 0.58
  const maxChars = Math.max(1, Math.floor(maxWidthPx / avgAdvance))
  if (text.length <= maxChars) return text
  if (maxChars <= 1) return '…'
  return `${text.slice(0, maxChars - 1)}…`
}

async function buildMediaDragCardIcon(options: {
  title?: string
  count?: number
  thumbPath?: string
}): Promise<Electron.NativeImage | null> {
  try {
    const sharp = (await import('sharp')).default
    const width = 75
    const height = 57
    const radius = 7
    const titleBar = 14
    const mediaH = height - titleBar
    const fontSize = 6.5
    const titlePad = 5
    const title = escapeXml(ellipsizeDragTitle(options.title || 'Media', width - titlePad * 2, fontSize))
    const count = Math.max(1, Math.floor(options.count || 1))
    // Render @2x so the smaller ghost stays sharp on Retina.
    const scale = 2

    let imageHref = ''
    const thumbPath = options.thumbPath ? normalizeMediaPath(options.thumbPath) : ''
    if (thumbPath && fs.existsSync(thumbPath)) {
      try {
        const thumbBuf = await sharp(thumbPath)
          .resize(width * scale, mediaH * scale, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
          .png({ compressionLevel: 6 })
          .toBuffer()
        imageHref = `data:image/png;base64,${thumbBuf.toString('base64')}`
      } catch {
        // keep empty image
      }
    }

    const stackOffset = 5
    const stack = count > 1
      ? `<rect x="${stackOffset}" y="${stackOffset}" width="${width}" height="${height}" rx="${radius}" fill="#a3a3ae" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`
      : ''
    const badgeW = String(count).length > 1 ? 16 : 13
    const badge = count > 1
      ? `<g transform="translate(${width - 1}, -2)">
           <rect x="0" y="0" width="${badgeW}" height="11" rx="5.5" fill="#3b82f6"/>
           <text x="${badgeW / 2}" y="8.2" text-anchor="middle" font-size="7" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fill="#fff">${count > 99 ? '99+' : count}</text>
         </g>`
      : ''

    const stackExtra = count > 1 ? stackOffset : 0
    const canvasW = width + stackExtra + 12
    const canvasH = height + stackExtra + 12
    const originX = 6
    const originY = count > 1 ? 8 : 6

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW * scale}" height="${canvasH * scale}" viewBox="0 0 ${canvasW} ${canvasH}">
  <g transform="translate(${originX}, ${originY})">
    ${stack}
    <defs>
      <clipPath id="card"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>
    </defs>
    <g clip-path="url(#card)">
      <rect width="${width}" height="${height}" fill="#1c1c1f"/>
      ${imageHref
        ? `<image href="${imageHref}" x="0" y="0" width="${width}" height="${mediaH}" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect width="${width}" height="${mediaH}" fill="#3f3f46"/>`}
      <rect y="${mediaH}" width="${width}" height="${titleBar}" fill="#25252a"/>
      <text x="${titlePad}" y="${mediaH + 9.5}" font-size="${fontSize}" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fill="rgba(255,255,255,0.92)">${title}</text>
    </g>
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.25"/>
    ${badge}
  </g>
</svg>`

    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const image = nativeImage.createFromBuffer(png)
    return image.isEmpty() ? null : image
  } catch (error) {
    console.warn('media-drag: sharp card icon failed:', error)
    return null
  }
}

async function resolveDragIcon(options: {
  iconDataUrl?: string
  thumbPath?: string
  title?: string
  count?: number
}): Promise<Electron.NativeImage> {
  const sharpIcon = await buildMediaDragCardIcon({
    title: options.title,
    count: options.count,
    thumbPath: options.thumbPath,
  })
  if (sharpIcon) return sharpIcon

  if (typeof options.iconDataUrl === 'string' && options.iconDataUrl.startsWith('data:image/')) {
    try {
      const fromDataUrl = nativeImage.createFromDataURL(options.iconDataUrl)
      if (!fromDataUrl.isEmpty()) return fromDataUrl
    } catch {
      // fall through
    }
  }

  if (typeof options.thumbPath === 'string' && options.thumbPath.length > 0) {
    try {
      const normalized = normalizeMediaPath(options.thumbPath)
      if (normalized && fs.existsSync(normalized)) {
        const thumb = nativeImage.createFromPath(normalized)
        if (!thumb.isEmpty()) {
          return thumb.resize({ width: 75, height: 57, quality: 'better' })
        }
      }
    } catch {
      // fall through
    }
  }

  const iconDir = path.join(__dirname, 'dist/icons')
  const candidates = [
    path.join(iconDir, 'icon32x32.png'),
    path.join(iconDir, 'favicon-32x32.png'),
    path.join(iconDir, 'icon.png'),
  ]
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) return image
  }
  return nativeImage.createEmpty()
}

type WindowBoundsConfig = {
  height?: number
  width?: number
  x?: number
  y?: number
  maximized?: boolean
}

type ServerWindowConfig = {
  win?: WindowBoundsConfig
  player?: WindowBoundsConfig
}

type AppServerExports = {
  config: import('./app/types/server').ServerConfig & ServerWindowConfig
  app: import('electron').App
  listener?: { close(): void }
  resolveFilePath?: unknown
}

process.electron_app = app

if (app.isPackaged) {
  process.env.NODE_ENV = 'production'
}

// Claim the single-instance lock before starting the HTTP server so a second
// launch exits immediately instead of racing on the listen port / prompts.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.warn('MediaChips is already running. Exiting second instance.')
  process.exit(0)
}

const serverModule = require('./app/server.js') as AppServerExports & { default?: AppServerExports }
const server = (serverModule.default ?? serverModule) as AppServerExports
const serverConfig = server.config

if (process.platform === 'win32') {
  const disableGpu = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MEDIA_CHIPS_DISABLE_GPU || '').toLowerCase()
  )
  if (disableGpu) {
    app.disableHardwareAcceleration()
  }
}

const isWindows = os.type() === 'Windows_NT'
const useWinElectronFrame = isWindows

let win: BrowserWindowInstance | null = null
let loading: BrowserWindowInstance | null = null
let player: BrowserWindowInstance | null = null
let tray: Electron.Tray | null = null
// When enabled (Windows only), closing the main window hides it to the system
// tray instead of quitting. Persisted in config.json (`minimizeToTray`); the
// renderer notifies the main process of runtime changes via `set-minimize-to-tray`.
let minimizeToTray = false
// Distinguishes an explicit quit (tray menu / File → Exit) from a window close
// that should be intercepted and turned into "hide to tray".
let isQuitting = false
let suppressPlayerWarmup = false
let suppressZoomChangedEvent = false
// Packaged Electron builds do not set NODE_ENV=production; rely on app.isPackaged.
const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== 'production'
const devLog = (...args: unknown[]) => {
  if (isDevelopment) console.log(...args)
}
// Vite is opt-in so `npx electron .` serves the built UI from the embedded backend.
const useViteDevServer = isDevelopment && process.env.MEDIA_CHIPS_VITE_DEV === '1'

const waitForBackend = async (port: number, timeoutMs = 30000) => {
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY

  while (Date.now() < deadline) {
    // Only treat the backend as ready after /api/ping succeeds. `server.listener`
    // is assigned when listen() is called, which can be before the port is bound
    // and before config.port is written — racing that left the UI on a stale port.
    const currentPort = serverConfig.port || port

    try {
      const response = await fetch(`http://127.0.0.1:${currentPort}/api/ping`)
      if (response.ok) return
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.warn(`Backend not ready on port ${serverConfig.port || port} after ${timeoutMs}ms; loading renderer anyway`)
}

function getElectronConfigPath(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'config.json')
  }
  return path.join(app.getPath('userData'), 'config.json')
}

function clampWindowBounds(bounds: { x: number; y: number; width: number; height: number }) {
  const width = Math.max(400, Math.round(bounds.width) || 1280)
  const height = Math.max(300, Math.round(bounds.height) || 720)
  const displays = screen.getAllDisplays()
  const intersects = displays.some((display) => {
    const area = display.workArea
    return (
      bounds.x < area.x + area.width
      && bounds.x + width > area.x
      && bounds.y < area.y + area.height
      && bounds.y + height > area.y
    )
  })

  if (intersects && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
    return { x: Math.round(bounds.x), y: Math.round(bounds.y), width, height }
  }

  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2)),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2)),
    width,
    height,
  }
}

function readStoredWindowBounds(kind: 'win' | 'player', fallbackWidth: number, fallbackHeight: number) {
  const stored = serverConfig[kind] || {}
  return clampWindowBounds({
    x: typeof stored.x === 'number' ? stored.x : Number.NaN,
    y: typeof stored.y === 'number' ? stored.y : Number.NaN,
    width: typeof stored.width === 'number' ? stored.width : fallbackWidth,
    height: typeof stored.height === 'number' ? stored.height : fallbackHeight,
  })
}

const windowBoundsSaveTimers: Partial<Record<'win' | 'player', ReturnType<typeof setTimeout>>> = {}

function persistWindowBounds(kind: 'win' | 'player', browserWindow: BrowserWindowInstance) {
  if (!browserWindow || browserWindow.isDestroyed()) return

  const isMaximized = browserWindow.isMaximized()
  const bounds = (
    isMaximized && typeof browserWindow.getNormalBounds === 'function'
      ? browserWindow.getNormalBounds()
      : browserWindow.getBounds()
  )

  serverConfig[kind] = {
    ...(serverConfig[kind] || {}),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: isMaximized,
  }

  try {
    saveConfigFile(getElectronConfigPath(), serverConfig)
  } catch (error) {
    console.warn('Failed to persist window bounds:', error)
  }
}

function schedulePersistWindowBounds(kind: 'win' | 'player', browserWindow: BrowserWindowInstance) {
  const existing = windowBoundsSaveTimers[kind]
  if (existing) clearTimeout(existing)
  windowBoundsSaveTimers[kind] = setTimeout(() => {
    persistWindowBounds(kind, browserWindow)
  }, 400)
}

function bindWindowBoundsPersistence(kind: 'win' | 'player', browserWindow: BrowserWindowInstance) {
  const save = () => schedulePersistWindowBounds(kind, browserWindow)
  browserWindow.on('move', save)
  browserWindow.on('resize', save)
  browserWindow.on('maximize', save)
  browserWindow.on('unmaximize', save)
}

const getRendererUrl = (search = '') => {
  const port = useViteDevServer
    ? Number(process.env.VITE_DEV_SERVER_PORT || 3000)
    : serverConfig.port
  const suffix = search
    ? (search.startsWith('?') ? search : `?${search}`)
    : ''
  return `http://localhost:${port}/${suffix}`
}

const getLoadingPageUrl = () => {
  if (useViteDevServer) {
    return `file://${path.join(__dirname, 'public/loading.html')}`
  }
  return `file://${path.join(__dirname, 'dist/loading.html')}`
}

const bindZoomChangedListener = (browserWindow: BrowserWindowInstance) => {
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

const setWebContentsZoomFactor = (webContents: WebContents, factor: unknown) => {
  if (!webContents || webContents.isDestroyed()) return 1

  const clamped = Math.min(3, Math.max(0.5, Number(factor) || 1))
  suppressZoomChangedEvent = true
  webContents.setZoomFactor(clamped)
  suppressZoomChangedEvent = false
  return clamped
}

const sendConfigToWindow = (browserWindow: BrowserWindowInstance) => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  browserWindow.webContents.send('config', server.config)
}

const bindRendererLoadRetry = (
  webContents: WebContents,
  getUrl: () => string,
) => {
  webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || useViteDevServer || webContents.isDestroyed()) return

    void (async () => {
      await waitForBackend(serverConfig.port, 10000)
      if (webContents.isDestroyed()) return
      await webContents.loadURL(getUrl())
    })()
  })
}

const createWindow = () => {
  // Allow reveal again when the window is recreated after close (e.g. macOS Dock click).
  isMainWindowRevealed = false

  const bounds = readStoredWindowBounds('win', 1280, 720)
  const shouldMaximize = Boolean(serverConfig.win?.maximized)

  win = new BrowserWindow({
    show: false,
    x: bounds.x,
    y: bounds.y,
    height: bounds.height,
    width: bounds.width,
    frame: !useWinElectronFrame,
    thickFrame: useWinElectronFrame,
    autoHideMenuBar: useWinElectronFrame,
    titleBarStyle: (os.type() === 'Darwin' && !useWinElectronFrame ? 'hidden' : 'default') as 'hidden' | 'default',
    trafficLightPosition: os.type() === 'Darwin' && !useWinElectronFrame ? {x: 18, y: 15} : undefined,
    backgroundColor: '#333',
    icon: path.join(__dirname, 'dist/icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, './electron/preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  })
  const mainWindow = win!
  if (shouldMaximize) {
    mainWindow.maximize()
  }
  bindWindowBoundsPersistence('win', mainWindow)
  bindRendererLoadRetry(mainWindow.webContents, () => getRendererUrl())
  mainWindow.loadURL(getRendererUrl())
  mainWindow.on('close', (event: Electron.Event) => {
    if (isWindows && minimizeToTray && !isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    if (process.platform !== 'darwin') app.quit()
    else win = null
  })
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('unmaximize')
  })
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('enter-full-screen')
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('leave-full-screen')
  })
  mainWindow.on('blur', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('focus', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('show', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('hide', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('minimize', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  mainWindow.on('restore', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  // macOS Spaces / fullscreen apps: window can stay "alive" but be occluded on another desktop.
  ;(mainWindow as BrowserWindowInstance & {
    on(event: 'occlusion-state-changed', listener: () => void): BrowserWindowInstance
  }).on('occlusion-state-changed', () => {
    emitMainWindowUserFacingState(mainWindow)
  })
  bindZoomChangedListener(mainWindow)
  bindMainWindowLoadedHandler(mainWindow)
  mainWindow.webContents.on('did-finish-load', () => {
    sendConfigToWindow(mainWindow)
    if (isDevelopment) {
      // mainWindow.webContents.openDevTools();
    }
  })
}

ipcMain.handle('get-config', () => server.config)

ipcMain.handle('get-machine-id', async () => machineId())

ipcMain.handle('setZoomFactor', (event: IpcMainInvokeEvent, factor: unknown) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender)
  if (!browserWindow || browserWindow.isDestroyed()) return 1
  return setWebContentsZoomFactor(browserWindow.webContents, factor)
})

ipcMain.handle('getZoomFactor', (event: IpcMainInvokeEvent) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender)
  if (!browserWindow || browserWindow.isDestroyed()) return 1
  return browserWindow.webContents.getZoomFactor()
})

ipcMain.handle('checkFileExists', async (_event: IpcMainInvokeEvent, data: Record<string, unknown>) => {
  const rawPath = typeof data === 'string' ? data : data?.path
  if (!rawPath) return false

  try {
    const filePath = normalizeMediaPath(rawPath)
    return Boolean(await resolveExistingPath(filePath))
  } catch {
    return false
  }
})

function parseMediaDragPaths(raw: unknown): string[] {
  if (typeof raw === 'string') return [raw]
  if (!raw || typeof raw !== 'object') return []
  const record = raw as { path?: unknown; paths?: unknown }
  if (Array.isArray(record.paths)) {
    return record.paths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  }
  if (typeof record.path === 'string' && record.path.length > 0) {
    return [record.path]
  }
  return []
}

function parseMediaDragStringField(raw: unknown, key: 'iconDataUrl' | 'thumbPath' | 'title'): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = (raw as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function parseMediaDragCount(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = (raw as { count?: unknown }).count
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

ipcMain.on('media-drag:read-data-url', (event: IpcMainEvent, rawPath: unknown) => {
  try {
    if (typeof rawPath !== 'string' || !rawPath) {
      event.returnValue = null
      return
    }
    const normalized = normalizeMediaPath(rawPath)
    if (!normalized || !fs.existsSync(normalized)) {
      event.returnValue = null
      return
    }
    const stat = fs.statSync(normalized)
    if (!stat.isFile() || stat.size <= 0 || stat.size > 12 * 1024 * 1024) {
      event.returnValue = null
      return
    }
    const buf = fs.readFileSync(normalized)
    const ext = path.extname(normalized).toLowerCase()
    const mime = ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg'
    event.returnValue = `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    event.returnValue = null
  }
})

ipcMain.on('media-drag:start', (event: IpcMainEvent, raw: unknown) => {
  const existingPaths: string[] = []
  for (const rawPath of parseMediaDragPaths(raw)) {
    try {
      const normalized = normalizeMediaPath(rawPath)
      if (!normalized || !fs.existsSync(normalized)) continue
      const stat = fs.statSync(normalized)
      if (!stat.isFile()) continue
      existingPaths.push(normalized)
    } catch {
      // skip invalid paths
    }
  }

  if (existingPaths.length === 0) {
    if (typeof (event as IpcMainEvent & { returnValue?: unknown }).returnValue !== 'undefined') {
      event.returnValue = false
    }
    return
  }

  const sender = event.sender
  void resolveDragIcon({
    iconDataUrl: parseMediaDragStringField(raw, 'iconDataUrl'),
    thumbPath: parseMediaDragStringField(raw, 'thumbPath'),
    title: parseMediaDragStringField(raw, 'title'),
    count: parseMediaDragCount(raw) ?? existingPaths.length,
  }).then((icon) => {
    if (sender.isDestroyed()) return
    try {
      sender.startDrag({
        file: existingPaths[0],
        ...(existingPaths.length > 1 ? { files: existingPaths } : {}),
        icon,
      })
    } catch (error) {
      console.warn('media-drag:start failed:', error)
    }
  })

  // sendSync callers still get an ack; async send ignores returnValue.
  event.returnValue = true
})

ipcMain.handle('openPath', async (_event: IpcMainInvokeEvent, data: Record<string, unknown> | string) => {
  const rawPath = typeof data === 'string' ? data : data?.path
  if (rawPath == null || rawPath === '') return {error: 'Path is required'}

  const entryPath = path.normalize(String(rawPath))
  // Reveal the file in Finder/Explorer instead of only opening the parent folder.
  if (typeof data === 'object' && data !== null && data.isDir) {
    try {
      shell.showItemInFolder(entryPath)
      return {success: true}
    } catch (error) {
      return {error: error instanceof Error ? error.message : String(error)}
    }
  }

  const error = await shell.openPath(entryPath)
  return error ? {error} : {success: true}
})

ipcMain.handle('openExternal', async (_event: IpcMainInvokeEvent, rawUrl: unknown) => {
  const url = String(rawUrl || '').trim()
  if (!url) return {error: 'URL is required'}

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {error: 'Invalid URL'}
  }

  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    return {error: 'Unsupported URL protocol'}
  }

  try {
    await shell.openExternal(parsed.toString())
    return {success: true}
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)}
  }
})

ipcMain.handle('dialog:saveFile', async (_event: IpcMainInvokeEvent, options: { defaultPath?: string; content?: string; filters?: Array<{ name: string; extensions: string[] }> } = {}) => {
  const result = await dialog.showSaveDialog({
    defaultPath: options.defaultPath,
    filters: options.filters || [{name: 'All Files', extensions: ['*']}],
  })

  if (result.canceled || !result.filePath) {
    return {canceled: true}
  }

  fs.writeFileSync(result.filePath, options.content ?? '', 'utf8')
  return {canceled: false, filePath: result.filePath}
})

ipcMain.handle('toggleDevTools', () => {
  if (win && !win.isDestroyed()) {
    win.webContents.toggleDevTools()
  }
})

// Keep splash visible until the renderer reports the UI shell is painted.
const MAIN_APP_READY_TIMEOUT_MS = 60_000

let isMainWindowRevealed = false
let mainRevealFallbackTimer: ReturnType<typeof setTimeout> | null = null

function hideLoadingWindow(): void {
  if (loading && !loading.isDestroyed()) {
    loading.hide()
    loading.close()
    loading = null
  }
}

function revealMainWindow(): void {
  if (!win || win.isDestroyed() || isMainWindowRevealed) return

  isMainWindowRevealed = true

  if (mainRevealFallbackTimer) {
    clearTimeout(mainRevealFallbackTimer)
    mainRevealFallbackTimer = null
  }

  devLog('App ready')
  hideLoadingWindow()
  win.show()
}

const bindMainWindowLoadedHandler = (mainWindow: BrowserWindowInstance) => {
  if (mainRevealFallbackTimer) {
    clearTimeout(mainRevealFallbackTimer)
  }

  mainRevealFallbackTimer = setTimeout(() => {
    console.warn('main-app-ready timeout, revealing main window')
    revealMainWindow()
  }, MAIN_APP_READY_TIMEOUT_MS)

  if (!mainWindow.webContents.isLoading()) {
    return
  }

  mainWindow.webContents.once('did-finish-load', () => {
    // Window reveal is deferred until renderer sends main-app-ready.
  })
}

const createLoadingWindow = () => {
  loading = new BrowserWindow({
    width: 320,
    height: 320,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    backgroundColor: '#333',
    icon: __dirname + `/icons/icon.png`,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      webSecurity: false,
      contextIsolation: false
    },
  })
  const loadingWindow = loading!

  loadingWindow.once('ready-to-show', () => {
    loadingWindow.show()
  })

  loadingWindow.loadURL(getLoadingPageUrl())
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
})

app.on('ready', async () => {
  // Wait for the API before any UI chrome. The port-in-use prompt may run first;
  // showing the splash behind it left a stuck logo with no main window.
  await waitForBackend(serverConfig.port, 600000)

  createLoadingWindow()
  createWindow()

  // config.json is the source of truth for the tray preference. Initialize the
  // in-memory flag and create the tray icon before the renderer has loaded.
  minimizeToTray = isWindows && serverConfig.minimizeToTray === '1'
  if (minimizeToTray) createTray()

  initAppUpdater({getWindow: () => win})
})

app.on("activate", async () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    await waitForBackend(serverConfig.port, 600000)
    createWindow()
  }
});

function quitApp() {
  isQuitting = true
  destroyTray()
  if (playerWarmupTimer) {
    clearTimeout(playerWarmupTimer)
    playerWarmupTimer = null
  }
  if (player && !player.isDestroyed()) {
    player.destroy()
    player = null
  }
  if (win && !win.isDestroyed()) {
    win.close()
  }
  if (server.listener) {
    server.listener.close()
  }
  app.quit()
}

// window events from render process. When "minimize to tray" is enabled on
// Windows, the in-app close button hides the window instead of quitting.
function handleCloseAppRequest() {
  if (isWindows && minimizeToTray && !isQuitting) {
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  quitApp()
}

ipcMain.on('closeApp', handleCloseAppRequest)

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    void waitForBackend(serverConfig.port, 600000).then(() => createWindow())
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray() {
  if (tray || !isWindows) return

  try {
    // Prefer the multi-size .ico (16/32/48) so Windows can pick the crispest
    // variant for the current DPI; fall back to the PNG if it is missing.
    const iconDir = path.join(__dirname, 'dist/icons')
    const icoPath = path.join(iconDir, 'favicon.ico')
    const pngPath = path.join(iconDir, 'icon.png')
    const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath
    const image = nativeImage.createFromPath(iconPath)
    tray = new Tray(image.isEmpty() ? iconPath : image)
    tray.setToolTip('MediaChips')
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: 'Open MediaChips', click: () => showMainWindow()},
      {type: 'separator'},
      {label: 'Exit', click: () => { isQuitting = true; quitApp() }},
    ]))
    tray.on('click', () => {
      if (win && !win.isDestroyed() && win.isVisible()) {
        win.hide()
      } else {
        showMainWindow()
      }
    })
    tray.on('double-click', () => showMainWindow())
  } catch (error) {
    console.warn('Failed to create tray icon:', error)
    tray = null
  }
}

function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

ipcMain.handle('set-minimize-to-tray', (_event: IpcMainInvokeEvent, enabled: unknown) => {
  minimizeToTray = Boolean(enabled)

  if (!isWindows) return minimizeToTray

  if (minimizeToTray) {
    createTray()
  } else {
    destroyTray()
    // Without a tray icon a hidden window would be unreachable, so restore it.
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show()
    }
  }

  return minimizeToTray
})

app.on('window-all-closed', () => {
  if (process.platform !== "darwin") // close if not macOS
    app.quit();
});

function stopPlayerPlayback() {
  if (player && !player.isDestroyed()) {
    player.webContents.send('stop-playing-video')
  }
}

ipcMain.handle('closePlayer', () => {
  stopPlayerPlayback()
  if (player && !player.isDestroyed()) {
    player.hide()
  }
})

ipcMain.handle('maximize', (_event: IpcMainInvokeEvent, args: unknown) => {
  if (args === 'player') {
    player?.maximize()
  } else {
    win?.maximize()
  }
})
ipcMain.handle('unmaximize', (_event: IpcMainInvokeEvent, args: unknown) => {
  if (args === 'player') {
    player?.unmaximize()
  } else {
    win?.unmaximize()
  }
})
ipcMain.handle('minimize', (_event: IpcMainInvokeEvent, args: unknown) => {
  if (args === 'player') {
    player?.minimize()
  } else {
    win?.minimize()
  }
})
ipcMain.handle('focusMainWindow', () => {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return true
})

function focusMainWindowFromNotification() {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** True only when the user can actually see/interact with the main window. */
function isBrowserWindowUserFacing(browserWindow: BrowserWindowInstance | null): boolean {
  if (!browserWindow || browserWindow.isDestroyed()) return false
  if (!browserWindow.isVisible()) return false
  if (browserWindow.isMinimized()) return false
  if (process.platform === 'darwin' && typeof app.isHidden === 'function' && app.isHidden()) {
    return false
  }
  try {
    const occluded = (browserWindow as BrowserWindowInstance & { isOccluded?: () => boolean }).isOccluded
    if (typeof occluded === 'function' && occluded.call(browserWindow)) {
      return false
    }
  } catch {
    // Older Electron builds may not expose occlusion APIs.
  }
  return browserWindow.isFocused()
}

function emitMainWindowUserFacingState(browserWindow: BrowserWindowInstance) {
  if (!browserWindow || browserWindow.isDestroyed()) return
  const facing = isBrowserWindowUserFacing(browserWindow)
  browserWindow.webContents.send(facing ? 'focus' : 'blur')
}

ipcMain.handle('isMainWindowFocused', () => {
  return isBrowserWindowUserFacing(win)
})

ipcMain.handle('showOsNotification', (_event: IpcMainInvokeEvent, raw: unknown) => {
  const payload = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const title = String(payload.title || '').trim() || 'MediaChips'
  const body = String(payload.body || '').trim()
  const silent = Boolean(payload.silent)

  if (!Notification.isSupported()) {
    return {success: false, supported: false, error: 'Notifications are not supported'}
  }

  try {
    const notification = new Notification({
      title,
      body,
      silent,
    })
    notification.on('click', () => {
      focusMainWindowFromNotification()
    })
    notification.show()
    return {success: true, supported: true}
  } catch (error) {
    return {
      success: false,
      supported: true,
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

ipcMain.handle('setDockBadge', (_event: IpcMainInvokeEvent, raw: unknown) => {
  const count = typeof raw === 'number'
    ? raw
    : Number((raw as {count?: unknown} | null)?.count ?? 0)
  const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(normalized > 0 ? String(normalized) : '')
    return true
  }

  // Windows overlay badge is limited; clear/set a simple count via progress mode unused.
  // Keep API no-op success so renderer can call unconditionally.
  return true
})

ipcMain.handle('setProgressBar', (_event: IpcMainInvokeEvent, raw: unknown) => {
  if (!win || win.isDestroyed()) return false

  let value: number | null = null
  if (typeof raw === 'number') {
    value = raw
  } else if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
    const next = (raw as {value: unknown}).value
    value = next == null ? null : Number(next)
  }

  if (value == null || !Number.isFinite(value) || value < 0) {
    win.setProgressBar(-1)
    return true
  }

  win.setProgressBar(Math.min(1, Math.max(0, value)))
  return true
})

ipcMain.handle('relaunch', () => {
  app.relaunch()
  app.exit()
})

ipcMain.handle('toggleMainFullscreen', () => {
  if (!win || win.isDestroyed()) return false
  win.setFullScreen(!win.isFullScreen())
  return win.isFullScreen()
})

ipcMain.handle('isMainFullscreen', () => {
  if (!win || win.isDestroyed()) return false
  return win.isFullScreen()
})

function sendMenuAction(action: string) {
  win?.webContents.send('menuAction', action)
}

function menuActionItem(label: string, action: string, accelerator?: string) {
  return {
    label,
    ...(accelerator ? {accelerator} : {}),
    click() {
      sendMenuAction(action)
    },
  }
}

const isMac = process.platform === 'darwin'

const fileMenu = {
  label: 'File',
  submenu: [
    menuActionItem('Add Media', 'addMedia'),
    {type: 'separator' as const},
    menuActionItem('Import Backup...', 'importBackup'),
    menuActionItem('Export Backup...', 'exportBackup'),
    {type: 'separator' as const},
    menuActionItem('Open Data Folder', 'openDataFolder'),
    {type: 'separator' as const},
    {role: 'close' as const},
  ],
}

const editMenu = {
  label: 'Edit',
  submenu: [
    {
      label: 'Undo',
      accelerator: 'CommandOrControl+Z',
      role: 'undo' as const,
    },
    {
      label: 'Redo',
      accelerator: 'CommandOrControl+Y',
      role: 'redo' as const,
    },
    {type: 'separator' as const},
    {
      label: 'Cut',
      accelerator: 'CommandOrControl+X',
      role: 'cut' as const,
    },
    {
      label: 'Copy',
      accelerator: 'CommandOrControl+C',
      role: 'copy' as const,
    },
    {
      label: 'Paste',
      accelerator: 'CommandOrControl+V',
      role: 'paste' as const,
    },
    {type: 'separator' as const},
    {
      label: 'Select all',
      accelerator: 'CommandOrControl+A',
      role: 'selectAll' as const,
    },
    menuActionItem('Global Search', 'globalSearch', 'CommandOrControl+F'),
  ],
}

const viewMenu = {
  label: 'View',
  submenu: [
    menuActionItem('Toggle Theme', 'toggleTheme'),
    {type: 'separator' as const},
    {role: 'zoomIn' as const},
    {role: 'zoomOut' as const},
    {role: 'resetZoom' as const},
    {type: 'separator' as const},
    {role: 'togglefullscreen' as const},
  ],
}

const appMenu = {
  label: 'App',
  submenu: [
    ...(!isMac ? [menuActionItem('Settings', 'settings', 'CommandOrControl+,')] : []),
    {
      label: 'Lock',
      id: 'lock',
      enabled: true,
      click() {
        lockApp()
      },
    },
    {type: 'separator' as const},
    menuActionItem('Restart', 'restart'),
    ...(!isMac ? [{
      label: 'Exit',
      accelerator: 'CommandOrControl+Q',
      click() {
        app.exit()
      },
    }] : []),
  ],
}

const windowMenu = {
  label: 'Window',
  submenu: [
    {role: 'minimize' as const},
    {role: 'zoom' as const},
    {type: 'separator' as const},
    {role: 'front' as const},
  ],
}

const helpMenu = {
  label: 'Help',
  submenu: [
    menuActionItem('Documentation', 'documentation'),
    menuActionItem('Getting Started', 'gettingStarted'),
    menuActionItem('Send Feedback', 'sendFeedback'),
    menuActionItem('Keyboard Shortcuts', 'keyboardShortcuts'),
    {type: 'separator' as const},
    menuActionItem('Check for Updates', 'checkUpdates'),
    menuActionItem('Version History', 'versionHistory'),
    menuActionItem('Website', 'website'),
    {type: 'separator' as const},
    {
      label: 'Toggle Developer Tools',
      accelerator: 'CommandOrControl+Shift+I',
      role: 'toggleDevTools' as const,
    },
    ...(!isMac ? [
      {type: 'separator' as const},
      menuActionItem('About', 'about'),
    ] : []),
  ],
}

const systemMenu = Menu.buildFromTemplate([
  ...(isMac ? [{
    label: app.name,
    submenu: [
      menuActionItem('About MediaChips', 'about'),
      {type: 'separator' as const},
      menuActionItem('Settings...', 'settings', 'CommandOrControl+,'),
      {type: 'separator' as const},
      {role: 'services' as const},
      {type: 'separator' as const},
      {role: 'hide' as const},
      {role: 'hideOthers' as const},
      {role: 'unhide' as const},
      {type: 'separator' as const},
      {role: 'quit' as const},
    ],
  }] : []),
  ...(isMac
    ? [fileMenu, editMenu, viewMenu, appMenu, windowMenu, helpMenu]
    : [appMenu, fileMenu, viewMenu, helpMenu]),
])

Menu.setApplicationMenu(systemMenu)

function lockApp() {
  win?.webContents.send('lockApp')
  player?.webContents.send('stop-playing-video')
}

process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    // Port conflicts are normally handled during server startup with a native
    // port-input dialog. This is only a last-resort safety net.
    const port = serverConfig.port || 12321
    dialog.showErrorBox('Startup Error',
      `Port ${port} is already in use.\n\n` +
      `Please close other applications using this port and restart the application.`
    );
    app.quit();
  } else {
    console.error('Uncaught Exception:', error);
  }
});

// folder selection dialog and getting their paths
ipcMain.handle('showOpenDialog', async (_event: IpcMainInvokeEvent, properties: unknown) => {
  devLog('showOpenDialog called with properties:', properties);

  let dialogProperties: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'> = []
  let filters: Array<{name: string; extensions: string[]}> | undefined

  if (properties && typeof properties === 'object' && !Array.isArray(properties) && 'properties' in (properties as object)) {
    const options = properties as {properties?: unknown; filters?: unknown}
    if (Array.isArray(options.properties)) {
      dialogProperties = options.properties as typeof dialogProperties
    }
    if (Array.isArray(options.filters)) {
      filters = options.filters as typeof filters
    }
  } else if (Array.isArray(properties)) {
    dialogProperties = properties as typeof dialogProperties
  } else if (typeof properties === 'string') {
    dialogProperties = [properties as typeof dialogProperties[number]]
  } else if (typeof properties === 'object' && properties !== null) {
    dialogProperties = Object.keys(properties).filter(key => (properties as Record<string, unknown>)[key] === true) as typeof dialogProperties
  }

  devLog('Dialog properties being used:', dialogProperties);

  try {
    const result = await dialog.showOpenDialog({
      properties: dialogProperties,
      ...(filters ? {filters} : {}),
    });

    devLog('Dialog closed, result:', {
      canceled: result.canceled,
      filePaths: result.filePaths,
      filePathsLength: result.filePaths.length
    });

    if (result.canceled) {
      return { canceled: true, filePaths: [] };
    }

    return {
      canceled: false,
      filePaths: result.filePaths,
      message: 'Directories selected successfully'
    };

  } catch (error: unknown) {
    console.error('Error in showOpenDialog:', error);
    return {
      error: true,
      message: error instanceof Error ? apiErrorMessage(error) : String(error),
      filePaths: []
    };
  }
});

// player window
let pendingPlayerPayload: unknown = null
let isPlayerRendererReady = false
let playerWarmupTimer: ReturnType<typeof setTimeout> | null = null

function getPlayerWindowOptions() {
  const bounds = readStoredWindowBounds('player', 1280, 720)
  return {
    frame: false,
    thickFrame: isWindows,
    show: false,
    x: bounds.x,
    y: bounds.y,
    height: bounds.height,
    width: bounds.width,
    titleBarStyle: 'hidden' as const,
    trafficLightPosition: os.type() === 'Darwin' ? {x: 12, y: 8} : undefined,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'dist/icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, './electron/preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  }
}

function setupPlayerWindowEvents(browserWindow: BrowserWindowInstance) {
  bindWindowBoundsPersistence('player', browserWindow)

  browserWindow.on('maximize', () => {
    browserWindow.webContents.send('maximize')
  })

  browserWindow.on('unmaximize', () => {
    browserWindow.webContents.send('unmaximize')
  })

  browserWindow.on('close', () => {
    stopPlayerPlayback()
  })

  browserWindow.on('closed', () => {
    player = null
    isPlayerRendererReady = false
    pendingPlayerPayload = null
    if (suppressPlayerWarmup) {
      suppressPlayerWarmup = false
      return
    }
    schedulePlayerWarmup()
  })

  browserWindow.on('enter-full-screen', () => {
    browserWindow.webContents.send('enter-full-screen')
  })

  browserWindow.on('leave-full-screen', () => {
    browserWindow.webContents.send('leave-full-screen')
  })

  browserWindow.webContents.on('did-finish-load', () => {
    sendConfigToWindow(browserWindow)
  })

  bindZoomChangedListener(browserWindow)
}

function createPlayerWindow() {
  if (player && !player.isDestroyed()) return player

  isPlayerRendererReady = false
  player = new BrowserWindow(getPlayerWindowOptions() as Electron.BrowserWindowConstructorOptions)
  const playerWindow = player!
  if (serverConfig.player?.maximized) {
    playerWindow.maximize()
  }
  setupPlayerWindowEvents(playerWindow)
  bindRendererLoadRetry(playerWindow.webContents, () => getRendererUrl('?player=true'))
  playerWindow.loadURL(getRendererUrl('?player=true'))
  return playerWindow
}

function deliverPlayerPayload(data: unknown) {
  if (!player || player.isDestroyed()) return

  sendConfigToWindow(player)
  player.webContents.send('play-video', data)
  if (!player.isVisible()) player.show()
  player.focus()
}

function schedulePlayerWarmup() {
  if (playerWarmupTimer || !isMainWindowRevealed) return

  playerWarmupTimer = setTimeout(() => {
    playerWarmupTimer = null
    if (!player || player.isDestroyed()) {
      createPlayerWindow()
    }
  }, 30_000)
}

function destroyPlayerWindow() {
  if (playerWarmupTimer) {
    clearTimeout(playerWarmupTimer)
    playerWarmupTimer = null
  }

  stopPlayerPlayback()

  if (player && !player.isDestroyed()) {
    suppressPlayerWarmup = true
    player.destroy()
  }

  player = null
  isPlayerRendererReady = false
  pendingPlayerPayload = null
}

ipcMain.handle('destroyPlayer', () => {
  destroyPlayerWindow()
})

ipcMain.on('main-app-ready', (event: IpcMainEvent) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return
  revealMainWindow()
  schedulePlayerWarmup()
})

ipcMain.on('player-ready', (event: IpcMainEvent) => {
  if (!player || player.isDestroyed() || event.sender !== player.webContents) return

  isPlayerRendererReady = true

  if (pendingPlayerPayload) {
    deliverPlayerPayload(pendingPlayerPayload)
    pendingPlayerPayload = null
  }
})

ipcMain.on('open-player', async (_event: IpcMainEvent, data: Record<string, unknown>) => {
  if (!player || player.isDestroyed()) {
    pendingPlayerPayload = data
    createPlayerWindow()
    return
  }

  if (isPlayerRendererReady) {
    deliverPlayerPayload(data)
    return
  }

  pendingPlayerPayload = data
  if (!player.isVisible()) player.show()
})
ipcMain.on('getItemsFromDb', async (_event: IpcMainEvent, data: unknown) => {
  win?.webContents.send('getItemsFromDb', data)
})
ipcMain.on('updateVideoFrames', async (_event: IpcMainEvent, id: unknown) => {
  win?.webContents.send('updateVideoFrames', id)
})
ipcMain.on('removeEntitiesFromState', async (_event: IpcMainEvent, data: unknown) => {
  win?.webContents.send('removeEntitiesFromState', data)
})
ipcMain.on('stop-playing-video', async () => {
  player?.webContents.send('stop-playing-video')
})
ipcMain.on('setFullScreen', async () => {
  player?.setFullScreen(false)
})