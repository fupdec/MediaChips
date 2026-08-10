import fs from 'fs'
import path from 'path'
import {
  app,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type NativeImage,
} from 'electron'
import {
  getTrayMenuLabels,
  normalizeTrayMenuLocale,
  type TrayMenuLabels,
} from '../shared/electron/trayMenuI18n'
import {
  dispatchJumpListAction,
  installWindowsJumpList as installWindowsJumpListImpl,
  isJumpListAction,
} from './windowsJumpList'

export type TrayPlatform = 'win32' | 'darwin' | 'linux' | string

export type AppTrayController = {
  createTray: () => boolean
  destroyTray: () => void
  /** True when a live tray/menu-bar icon exists (safe to hide the main window). */
  hasTrayIcon: () => boolean
  /** Create the tray if minimize-to-tray is enabled; returns whether an icon is available. */
  ensureTray: () => boolean
  getMinimizeToTray: () => boolean
  setMinimizeToTray: (enabled: boolean) => boolean
  /** macOS only: custom items on the Dock icon context menu. */
  installDockMenu: () => void
  /** Windows: Jump List tasks on the taskbar icon right-click menu. */
  installWindowsJumpList: () => void
  /** Handle a Jump List / CLI action (show, addMedia, quit, …). */
  handleJumpListAction: (action: string) => void
  /** Sync tray / Dock / Jump List labels to the app UI language. */
  setLocale: (locale: string) => void
  registerIpc: () => void
}

export type BuildTrayMenuTemplateDeps = {
  platform: TrayPlatform
  labels: TrayMenuLabels
  showMainWindow: () => void
  hideMainWindow: () => void
  sendMenuAction: (action: string) => void
  onLock: () => void
  quitApp: () => void
  setIsQuitting: (value: boolean) => void
}

/** True for desktop platforms that use a notification-area / menu-bar tray. */
export function isTraySupportedPlatform(platform: TrayPlatform = process.platform): boolean {
  return platform === 'win32' || platform === 'darwin' || platform === 'linux'
}

export function buildTrayMenuTemplate(
  deps: BuildTrayMenuTemplateDeps,
): MenuItemConstructorOptions[] {
  const quitLabel = deps.platform === 'darwin' ? deps.labels.quit : deps.labels.exit

  return [
    {label: deps.labels.show, click: () => deps.showMainWindow()},
    {
      label: deps.labels.hide,
      click: () => deps.hideMainWindow(),
    },
    {type: 'separator'},
    {
      label: deps.labels.addMedia,
      click: () => deps.sendMenuAction('addMedia'),
    },
    {
      label: deps.labels.settings,
      click: () => {
        deps.showMainWindow()
        deps.sendMenuAction('settings')
      },
    },
    {
      label: deps.labels.lock,
      click: () => deps.onLock(),
    },
    {type: 'separator'},
    {
      label: deps.labels.checkUpdates,
      click: () => {
        deps.showMainWindow()
        deps.sendMenuAction('checkUpdates')
      },
    },
    {type: 'separator'},
    {
      id: 'tray-quit',
      label: quitLabel,
      click: () => {
        deps.setIsQuitting(true)
        deps.quitApp()
      },
    },
  ]
}

/** Dock menu omits Quit — macOS already provides "Quit" under Options. */
export function buildDockMenuTemplate(
  deps: Omit<BuildTrayMenuTemplateDeps, 'quitApp' | 'setIsQuitting' | 'platform'> & {
    platform?: TrayPlatform
  },
): MenuItemConstructorOptions[] {
  const items = buildTrayMenuTemplate({
    platform: deps.platform ?? 'darwin',
    labels: deps.labels,
    showMainWindow: deps.showMainWindow,
    hideMainWindow: deps.hideMainWindow,
    sendMenuAction: deps.sendMenuAction,
    onLock: deps.onLock,
    quitApp: () => {},
    setIsQuitting: () => {},
  }).filter((item) => !('id' in item && item.id === 'tray-quit'))

  while (items.length > 0 && items[items.length - 1]?.type === 'separator') {
    items.pop()
  }
  return items
}

export type TraySilhouetteFill = 'black' | 'white'

function resolveTraySourcePath(appRoot: string): string {
  const iconDir = path.join(appRoot, 'dist/icons')
  const templatePath = path.join(iconDir, 'trayTemplate.png')
  const pngPath = path.join(iconDir, 'icon.png')
  const png32Path = path.join(iconDir, 'favicon-32x32.png')
  const png16Path = path.join(iconDir, 'favicon-16x16.png')
  const icoPath = path.join(iconDir, 'favicon.ico')

  // Prefer the dedicated monochrome tray asset on every platform.
  if (fs.existsSync(templatePath)) return templatePath
  if (fs.existsSync(pngPath)) return pngPath
  if (fs.existsSync(png32Path)) return png32Path
  if (fs.existsSync(png16Path)) return png16Path
  return icoPath
}

function resolveTrayIcon(
  appRoot: string,
  platform: TrayPlatform,
  options: {preferLightGlyph?: boolean} = {},
) {
  const iconPath = resolveTraySourcePath(appRoot)
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return {image, iconPath}

  if (platform === 'darwin') {
    // macOS menu-bar templates are auto-tinted by the OS (light/dark menu bar).
    image = toMacMenuBarTemplateImage(image)
  } else {
    // Windows / Linux have no template icons — pick a fixed glyph color from OS theme.
    const fill: TraySilhouetteFill = options.preferLightGlyph ? 'white' : 'black'
    image = toTraySilhouetteImage(image, fill)
  }
  return {image, iconPath}
}

/**
 * Solid silhouette with binary alpha (used before smooth downscale).
 * Accepts white-on-transparent or colored logos; dark backgrounds become transparent.
 */
export function applyMacTrayTemplateBitmap(
  bitmap: Buffer,
  fill: TraySilhouetteFill = 'black',
): void {
  const channel = fill === 'white' ? 255 : 0
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i] ?? 0
    const g = bitmap[i + 1] ?? 0
    const r = bitmap[i + 2] ?? 0
    const a = bitmap[i + 3] ?? 0
    const maxChannel = Math.max(r, g, b)

    const isLogo = a >= 128 && maxChannel >= 40
    bitmap[i] = channel
    bitmap[i + 1] = channel
    bitmap[i + 2] = channel
    bitmap[i + 3] = isLogo ? 255 : 0
  }
}

/** Keep RGB solid after smooth resize; preserve antialiased alpha. */
export function keepBlackPreserveAlpha(
  bitmap: Buffer,
  fill: TraySilhouetteFill = 'black',
): void {
  const channel = fill === 'white' ? 255 : 0
  for (let i = 0; i < bitmap.length; i += 4) {
    bitmap[i] = channel
    bitmap[i + 1] = channel
    bitmap[i + 2] = channel
  }
}

function solidSmoothTraySize(
  mask: NativeImage,
  size: number,
  fill: TraySilhouetteFill = 'black',
): NativeImage {
  const resized = mask.resize({width: size, height: size, quality: 'best'})
  const bitmap = Buffer.from(resized.toBitmap())
  keepBlackPreserveAlpha(bitmap, fill)
  return nativeImage.createFromBitmap(bitmap, {width: size, height: size})
}

function buildTraySilhouetteMask(
  source: NativeImage,
  fill: TraySilhouetteFill,
): NativeImage | null {
  const sourceSize = source.getSize()
  if (sourceSize.width <= 0 || sourceSize.height <= 0) return null

  // Binary mask at higher resolution, then downscale for smooth edges.
  const workSize = Math.max(64, sourceSize.width, sourceSize.height)
  const base = (sourceSize.width === workSize && sourceSize.height === workSize)
    ? source
    : source.resize({width: workSize, height: workSize, quality: 'best'})

  const maskBitmap = Buffer.from(base.toBitmap())
  applyMacTrayTemplateBitmap(maskBitmap, fill)
  return nativeImage.createFromBitmap(maskBitmap, {
    width: workSize,
    height: workSize,
  })
}

/**
 * Build a Retina-ready menu-bar template: solid black fill, smooth edges via
 * hi-res mask → downscale (16@1x + 32@2x). macOS tints this automatically.
 */
export function toMacMenuBarTemplateImage(source: NativeImage): NativeImage {
  const mask = buildTraySilhouetteMask(source, 'black')
  if (!mask) return source

  const img16 = solidSmoothTraySize(mask, 16, 'black')
  const img32 = solidSmoothTraySize(mask, 32, 'black')

  const template = nativeImage.createEmpty()
  template.addRepresentation({
    scaleFactor: 1,
    width: 16,
    height: 16,
    buffer: img16.toPNG(),
  })
  template.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: img32.toPNG(),
  })
  template.setTemplateImage(true)
  return template
}

/**
 * Fixed-color tray glyph for Windows / Linux (no OS template tinting).
 */
export function toTraySilhouetteImage(
  source: NativeImage,
  fill: TraySilhouetteFill,
): NativeImage {
  const mask = buildTraySilhouetteMask(source, fill)
  if (!mask) return source

  const img16 = solidSmoothTraySize(mask, 16, fill)
  const img32 = solidSmoothTraySize(mask, 32, fill)

  const image = nativeImage.createEmpty()
  image.addRepresentation({
    scaleFactor: 1,
    width: 16,
    height: 16,
    buffer: img16.toPNG(),
  })
  image.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: img32.toPNG(),
  })
  return image
}

function trayPrefersLightGlyph(): boolean {
  return Boolean(nativeTheme.shouldUseDarkColors)
}

export function createAppTrayController(deps: {
  platform?: TrayPlatform
  getMainWindow: () => BrowserWindow | null
  showMainWindow: () => void
  sendMenuAction: (action: string) => void
  onLock: () => void
  quitApp: () => void
  setIsQuitting: (value: boolean) => void
  /** Directory that contains `dist/icons` (usually project root). */
  getAppRoot: () => string
  /** Called when UI locale changes (tray / Dock / Jump List already updated). */
  onLocaleChange?: (locale: string) => void
}): AppTrayController {
  const platform = deps.platform ?? process.platform
  const traySupported = isTraySupportedPlatform(platform)
  let tray: Tray | null = null
  let minimizeToTray = false
  let locale = normalizeTrayMenuLocale('en')
  let themeListenerBound = false

  function hideMainWindow() {
    const win = deps.getMainWindow()
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.hide()
    }
  }

  function menuDeps(): BuildTrayMenuTemplateDeps {
    return {
      platform,
      labels: getTrayMenuLabels(locale),
      showMainWindow: deps.showMainWindow,
      hideMainWindow,
      sendMenuAction: deps.sendMenuAction,
      onLock: deps.onLock,
      quitApp: deps.quitApp,
      setIsQuitting: deps.setIsQuitting,
    }
  }

  function applyContextMenu() {
    if (!tray) return
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(menuDeps())))
  }

  function installDockMenu() {
    if (platform !== 'darwin') return

    const apply = () => {
      if (!app.dock) return
      try {
        app.dock.setMenu(Menu.buildFromTemplate(buildDockMenuTemplate(menuDeps())))
      } catch (error) {
        console.warn('Failed to install Dock menu:', error)
      }
    }

    if (app.isReady()) apply()
    else void app.whenReady().then(apply)
  }

  function installWindowsJumpList() {
    if (platform !== 'win32') return
    const apply = () => {
      installWindowsJumpListImpl({
        getAppRoot: deps.getAppRoot,
        locale,
      })
    }
    if (app.isReady()) apply()
    else void app.whenReady().then(apply)
  }

  function refreshLocalizedMenus() {
    applyContextMenu()
    if (platform === 'darwin') installDockMenu()
    if (platform === 'win32') installWindowsJumpList()
  }

  function setLocale(nextLocale: string) {
    locale = normalizeTrayMenuLocale(nextLocale)
    refreshLocalizedMenus()
    deps.onLocaleChange?.(locale)
  }

  function createTray(): boolean {
    if (tray) return true
    if (!traySupported) return false

    try {
      const {image, iconPath} = resolveTrayIcon(deps.getAppRoot(), platform, {
        preferLightGlyph: trayPrefersLightGlyph(),
      })
      tray = new Tray(image.isEmpty() ? iconPath : image)
      tray.setToolTip('MediaChips')
      applyContextMenu()
      bindTrayThemeListener()

      if (platform === 'darwin') {
        // macOS: context menu is primary; only restore if the window is hidden.
        tray.on('click', () => {
          const win = deps.getMainWindow()
          if (!win || win.isDestroyed() || !win.isVisible()) {
            deps.showMainWindow()
          }
        })
      } else {
        // Windows / Linux: left-click toggles visibility.
        tray.on('click', () => {
          const win = deps.getMainWindow()
          if (win && !win.isDestroyed() && win.isVisible()) {
            win.hide()
          } else {
            deps.showMainWindow()
          }
        })
        tray.on('double-click', () => deps.showMainWindow())
      }
      return true
    } catch (error) {
      console.warn('Failed to create tray icon:', error)
      tray = null
      return false
    }
  }

  function refreshTrayImage() {
    if (!tray || platform === 'darwin') return
    try {
      const {image, iconPath} = resolveTrayIcon(deps.getAppRoot(), platform, {
        preferLightGlyph: trayPrefersLightGlyph(),
      })
      tray.setImage(image.isEmpty() ? iconPath : image)
    } catch (error) {
      console.warn('Failed to refresh tray icon:', error)
    }
  }

  function bindTrayThemeListener() {
    if (platform === 'darwin' || themeListenerBound) return
    themeListenerBound = true
    nativeTheme.on('updated', refreshTrayImage)
  }

  function destroyTray() {
    if (themeListenerBound) {
      nativeTheme.removeListener('updated', refreshTrayImage)
      themeListenerBound = false
    }
    if (tray) {
      tray.destroy()
      tray = null
    }
  }

  function hasTrayIcon() {
    return tray != null
  }

  function ensureTray() {
    if (!minimizeToTray || !traySupported) return false
    return createTray()
  }

  function setMinimizeToTray(enabled: boolean) {
    minimizeToTray = Boolean(enabled)

    if (!traySupported) return minimizeToTray

    if (minimizeToTray) {
      createTray()
    } else {
      destroyTray()
      // Without a tray icon a hidden window would be unreachable, so restore it.
      const win = deps.getMainWindow()
      if (win && !win.isDestroyed() && !win.isVisible()) {
        win.show()
      }
    }

    return minimizeToTray
  }

  function handleJumpListAction(action: string) {
    if (!isJumpListAction(action)) return
    dispatchJumpListAction(action, {
      showMainWindow: deps.showMainWindow,
      hideMainWindow,
      sendMenuAction: deps.sendMenuAction,
      onLock: deps.onLock,
      quitApp: deps.quitApp,
      setIsQuitting: deps.setIsQuitting,
    })
  }

  function registerIpc() {
    ipcMain.handle('set-minimize-to-tray', (_event: IpcMainInvokeEvent, enabled: unknown) => {
      return setMinimizeToTray(Boolean(enabled))
    })
    ipcMain.handle('set-shell-locale', (_event: IpcMainInvokeEvent, nextLocale: unknown) => {
      setLocale(String(nextLocale || 'en'))
      return normalizeTrayMenuLocale(nextLocale)
    })
  }

  return {
    createTray,
    destroyTray,
    hasTrayIcon,
    ensureTray,
    getMinimizeToTray: () => minimizeToTray,
    setMinimizeToTray,
    installDockMenu,
    installWindowsJumpList,
    handleJumpListAction,
    setLocale,
    registerIpc,
  }
}
