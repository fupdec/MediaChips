import os from 'os'
import {bindCaptionDoubleClick} from './captionDoubleClick'
import {bindRoundedWindow} from './roundedWindow'
import {bindPlayerFrame, createPlayerFrame, overlayWindowOptions, type PlayerFrame} from './playerFrame'
import path from 'path'
import {
  BrowserWindow,
  ipcMain,
  type BrowserWindowConstructorOptions,
  type IpcMainEvent,
} from 'electron'
import type {WindowBoundsKind} from './windowBounds'
import {resolveWindowIconPath} from './windowIcon'

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
  /** Native video sits under the web view, so the window must be transparent. */
  transparentWindow?: boolean
}): PlayerWindowController {
  let player: BrowserWindow | null = null
  /** Windows native player: the system-decorated window the transparent player window sits on. */
  const useFrame = deps.isWindows && Boolean(deps.transparentWindow)
  let frame: PlayerFrame | null = null
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
      backgroundColor: deps.transparentWindow ? '#00000000' : '#000000',
      ...(deps.transparentWindow ? {transparent: true} : {}),
      icon: resolveWindowIconPath(appRoot),
      webPreferences: {
        preload: path.join(appRoot, 'electron/preload.js'),
        contextIsolation: true,
        sandbox: false,
        backgroundThrottling: false,
        // Windows frame mode: fullscreen is applied to the frame, not to this window.
        disableHtmlFullscreenWindowResize: useFrame,
      },
    }
  }

  function stopPlayerPlayback() {
    if (player && !player.isDestroyed()) {
      player.webContents.send('stop-playing-video')
    }
  }

  /**
   * Show the window, restoring the maximized state. `maximize()` also shows a hidden window, so it
   * must not run for the warm-up window created in the background (it would pop up on its own).
   */
  function showPlayerWindow(browserWindow: BrowserWindow) {
    if (frame && !frame.window.isDestroyed()) {
      const frameWindow = frame.window
      if (frameWindow.isVisible() && browserWindow.isVisible()) return
      if (deps.isPlayerMaximizedPreferred() && !frameWindow.isMaximized()) frameWindow.maximize()
      frameWindow.show()
      browserWindow.setBounds(frameWindow.getContentBounds())
      browserWindow.show()
      return
    }
    if (browserWindow.isVisible()) return
    if (deps.isPlayerMaximizedPreferred() && !browserWindow.isMaximized()) browserWindow.maximize()
    browserWindow.show()
  }

  function deliverPlayerPayload(data: unknown) {
    if (!player || player.isDestroyed()) return

    deps.sendConfigToWindow(player)
    player.webContents.send('play-video', data)
    showPlayerWindow(player)
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
    deps.bindWindowBoundsPersistence('player', frame && !frame.window.isDestroyed() ? frame.window : browserWindow)

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
      frame = null
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
    const search = useFrame ? '?player=true&frame=native' : '?player=true'
    if (useFrame) {
      const bounds = deps.readStoredWindowBounds('player', 1280, 720)
      frame = createPlayerFrame({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        title: 'MediaChips',
        icon: resolveWindowIconPath(deps.getAppRoot()),
      })
      player = new BrowserWindow({
        ...getPlayerWindowOptions(),
        ...overlayWindowOptions(frame),
        ...frame.window.getContentBounds(),
      })
      bindPlayerFrame(player, frame, () => closePlayer())
    } else {
      player = new BrowserWindow(getPlayerWindowOptions())
    }
    setupPlayerWindowEvents(player)
    if (!useFrame) {
      bindCaptionDoubleClick(player, Boolean(deps.transparentWindow))
      bindRoundedWindow(player, Boolean(deps.transparentWindow))
    }
    deps.bindRendererLoadRetry(player.webContents, () => deps.getRendererUrl(search))
    player.loadURL(deps.getRendererUrl(search))
    return player
  }

  function destroyPlayerWindow() {
    if (playerWarmupTimer) {
      clearTimeout(playerWarmupTimer)
      playerWarmupTimer = null
    }

    stopPlayerPlayback()

    if (frame) frame.allowClose = true
    if (player && !player.isDestroyed()) {
      suppressPlayerWarmup = true
      player.destroy()
    }
    if (frame && !frame.window.isDestroyed()) frame.window.destroy()

    frame = null
    player = null
    isPlayerRendererReady = false
    pendingPlayerPayload = null
  }

  function closePlayer() {
    stopPlayerPlayback()
    if (player && !player.isDestroyed()) {
      player.hide()
    }
    if (frame && !frame.window.isDestroyed()) frame.window.hide()
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
      showPlayerWindow(player)
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
