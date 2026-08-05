import {screen, type BrowserWindow} from 'electron'
import {saveConfigFile} from '../app/server/configFile'

export type WindowBoundsConfig = {
  height?: number
  width?: number
  x?: number
  y?: number
  maximized?: boolean
}

export type WindowBoundsKind = 'win' | 'player'

export type DisplayWorkArea = {
  x: number
  y: number
  width: number
  height: number
}

export type DisplayLike = {
  workArea: DisplayWorkArea
}

export type WindowBoundsStore = Partial<Record<WindowBoundsKind, WindowBoundsConfig>>

/**
 * Keep a window on a visible display work area. Pure aside from optional
 * display providers (defaults to Electron `screen`).
 */
export function clampWindowBounds(
  bounds: {x: number; y: number; width: number; height: number},
  {
    getDisplays = () => screen.getAllDisplays() as DisplayLike[],
    getPrimaryWorkArea = () => screen.getPrimaryDisplay().workArea as DisplayWorkArea,
  }: {
    getDisplays?: () => DisplayLike[]
    getPrimaryWorkArea?: () => DisplayWorkArea
  } = {},
) {
  const width = Math.max(400, Math.round(bounds.width) || 1280)
  const height = Math.max(300, Math.round(bounds.height) || 720)
  const displays = getDisplays()
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
    return {x: Math.round(bounds.x), y: Math.round(bounds.y), width, height}
  }

  const workArea = getPrimaryWorkArea()
  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2)),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2)),
    width,
    height,
  }
}

export function createWindowBoundsPersistence(deps: {
  getStore: () => WindowBoundsStore
  getConfigPath: () => string
  saveConfig?: (configPath: string, store: WindowBoundsStore) => void
}) {
  const saveTimers: Partial<Record<WindowBoundsKind, ReturnType<typeof setTimeout>>> = {}
  const saveConfig = deps.saveConfig || ((configPath, store) => {
    saveConfigFile(configPath, store)
  })

  function readStoredWindowBounds(
    kind: WindowBoundsKind,
    fallbackWidth: number,
    fallbackHeight: number,
  ) {
    const stored = deps.getStore()[kind] || {}
    return clampWindowBounds({
      x: typeof stored.x === 'number' ? stored.x : Number.NaN,
      y: typeof stored.y === 'number' ? stored.y : Number.NaN,
      width: typeof stored.width === 'number' ? stored.width : fallbackWidth,
      height: typeof stored.height === 'number' ? stored.height : fallbackHeight,
    })
  }

  function persistWindowBounds(kind: WindowBoundsKind, browserWindow: BrowserWindow) {
    if (!browserWindow || browserWindow.isDestroyed()) return

    const isMaximized = browserWindow.isMaximized()
    const bounds = (
      isMaximized && typeof browserWindow.getNormalBounds === 'function'
        ? browserWindow.getNormalBounds()
        : browserWindow.getBounds()
    )

    const store = deps.getStore()
    store[kind] = {
      ...(store[kind] || {}),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: isMaximized,
    }

    try {
      saveConfig(deps.getConfigPath(), store)
    } catch (error) {
      console.warn('Failed to persist window bounds:', error)
    }
  }

  function schedulePersistWindowBounds(kind: WindowBoundsKind, browserWindow: BrowserWindow) {
    const existing = saveTimers[kind]
    if (existing) clearTimeout(existing)
    saveTimers[kind] = setTimeout(() => {
      persistWindowBounds(kind, browserWindow)
    }, 400)
  }

  function bindWindowBoundsPersistence(kind: WindowBoundsKind, browserWindow: BrowserWindow) {
    const save = () => schedulePersistWindowBounds(kind, browserWindow)
    browserWindow.on('move', save)
    browserWindow.on('resize', save)
    browserWindow.on('maximize', save)
    browserWindow.on('unmaximize', save)
  }

  return {
    readStoredWindowBounds,
    persistWindowBounds,
    schedulePersistWindowBounds,
    bindWindowBoundsPersistence,
  }
}
