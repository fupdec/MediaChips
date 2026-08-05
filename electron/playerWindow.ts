import os from 'os'
import path from 'path'
import {
  BrowserWindow,
  ipcMain,
  type BrowserWindowConstructorOptions,
  type IpcMainEvent,
} from 'electron'
import type {WindowBoundsKind} from './windowBounds'

export type PlayerWindowController = {
  getWindow: () => BrowserWindow | null
  createPlayerWindow: () => BrowserWindow
  destroyPlayerWindow: () => void
  schedulePlayerWarmup: () => void
  stopPlayerPlayback: () => void
  closePlayer: () => void
  registerIpc: () => void
}

export function createPlayerWindowController(deps: {
  isWindows: boolean
  getAppRoot: () => string
  getRendererUrl: (search?: string) => string
  readStoredWindowBounds: (
    kind: WindowBoundsKind,
    fallbackWidth: number,
    fallbackHeight: number,
  ) => {x: number; y: number; width: number; height: number}
  bindWindowBoundsPersistence: (kind: WindowBoundsKind, browserWindow: BrowserWindow) => void
  bindRendererLoadRetry: (webContents: Electron.WebContents, getUrl: () => string) => void
  sendConfigToWindow: (browserWindow: BrowserWindow) => void
  bindZoomChangedListener: (browserWindow: BrowserWindow) => void
  isPlayerMaximizedPreferred: () => boolean
  isMainWindowRevealed: () => boolean
}): PlayerWindowController {
  let player: BrowserWindow | null = null
  let pendingPlayerPayload: unknown = null
  let isPlayerRendererReady = false
  let playerWarmupTimer: ReturnType<typeof setTimeout> | null = null
  let suppressPlayerWarmup = false

  function getPlayerWindowOptions(): BrowserWindowConstructorOptions {
    const bounds = deps.readStoredWindowBounds('player', 1280, 720)
    const appRoot = deps.getAppRoot()
    return {
      frame: false,
      thickFrame: deps.isWindows,
      show: false,
      x: bounds.x,
      y: bounds.y,
      height: bounds.height,
      width: bounds.width,
      titleBarStyle: 'hidden',
      trafficLightPosition: os.type() === 'Darwin' ? {x: 12, y: 8} : undefined,
      backgroundColor: '#000000',
      icon: path.join(appRoot, 'dist/icons', 'icon.png'),
      webPreferences: {
        preload: path.join(appRoot, 'electron/preload.js'),
        contextIsolation: true,
        sandbox: false,
        backgroundThrottling: false,
      },
    }
  }

  function stopPlayerPlayback() {
    if (player && !player.isDestroyed()) {
      player.webContents.send('stop-playing-video')
    }
  }

  function deliverPlayerPayload(data: unknown) {
    if (!player || player.isDestroyed()) return

    deps.sendConfigToWindow(player)
    player.webContents.send('play-video', data)
    if (!player.isVisible()) player.show()
    player.focus()
  }

  function schedulePlayerWarmup() {
    if (playerWarmupTimer || !deps.isMainWindowRevealed()) return

    playerWarmupTimer = setTimeout(() => {
      playerWarmupTimer = null
      if (!player || player.isDestroyed()) {
        createPlayerWindow()
      }
    }, 30_000)
  }

  function setupPlayerWindowEvents(browserWindow: BrowserWindow) {
    deps.bindWindowBoundsPersistence('player', browserWindow)

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
      deps.sendConfigToWindow(browserWindow)
    })

    deps.bindZoomChangedListener(browserWindow)
  }

  function createPlayerWindow() {
    if (player && !player.isDestroyed()) return player

    isPlayerRendererReady = false
    player = new BrowserWindow(getPlayerWindowOptions())
    if (deps.isPlayerMaximizedPreferred()) {
      player.maximize()
    }
    setupPlayerWindowEvents(player)
    deps.bindRendererLoadRetry(player.webContents, () => deps.getRendererUrl('?player=true'))
    player.loadURL(deps.getRendererUrl('?player=true'))
    return player
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

  function closePlayer() {
    stopPlayerPlayback()
    if (player && !player.isDestroyed()) {
      player.hide()
    }
  }

  function registerIpc() {
    ipcMain.handle('closePlayer', () => {
      closePlayer()
    })

    ipcMain.handle('destroyPlayer', () => {
      destroyPlayerWindow()
    })

    ipcMain.on('player-ready', (event: IpcMainEvent) => {
      if (!player || player.isDestroyed() || event.sender !== player.webContents) return

      isPlayerRendererReady = true

      if (pendingPlayerPayload) {
        deliverPlayerPayload(pendingPlayerPayload)
        pendingPlayerPayload = null
      }
    })

    ipcMain.on('open-player', (_event: IpcMainEvent, data: Record<string, unknown>) => {
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

    ipcMain.on('stop-playing-video', () => {
      player?.webContents.send('stop-playing-video')
    })

    ipcMain.on('setFullScreen', () => {
      player?.setFullScreen(false)
    })
  }

  return {
    getWindow: () => player,
    createPlayerWindow,
    destroyPlayerWindow,
    schedulePlayerWarmup,
    stopPlayerPlayback,
    closePlayer,
    registerIpc,
  }
}
