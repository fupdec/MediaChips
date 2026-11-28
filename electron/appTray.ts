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

export function resolveTraySourcePath(appRoot: string, exists: (file: string) => boolean = fs.existsSync): string {
  // dist/icons is what a build ships; public/icons is its source. Under `npm run electron` the UI
  // comes from Vite and dist/ can be an old build without newer icons, so look in both.
  const iconDirs = [path.join(appRoot, 'dist/icons'), path.join(appRoot, 'public/icons')]
  // Prefer the dedicated monochrome outline tray asset on every platform; the other files are
  // colored logos that only make a filled silhouette.
  for (const name of ['trayTemplate.png', 'icon.png', 'favicon-32x32.png', 'favicon-16x16.png']) {
    for (const dir of iconDirs) {
      const candidate = path.join(dir, name)
      if (exists(candidate)) return candidate
    }
  }
  return path.join(iconDirs[0], 'favicon.ico')
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
  } else if (platform === 'win32') {
    // Windows picks a poor representation out of a multi-scale nativeImage and stretches it (a thick,
    // blurry glyph). An .ico with every tray size lets the shell take the exact one for the DPI.
    // The tray shows the colored app logo.
    const colorPath = writeWindowsColorTrayIco(appRoot)
    if (colorPath) return {image: nativeImage.createEmpty(), iconPath: colorPath}
    image = toTraySilhouetteImage(image, options.preferLightGlyph ? 'white' : 'black')
  } else {
    // Windows / Linux have no template icons — pick a fixed glyph color from OS theme.
    const fill: TraySilhouetteFill = options.preferLightGlyph ? 'white' : 'black'
    image = toTraySilhouetteImage(image, fill)
  }
  return {image, iconPath}
}

/**
 * Binary mask of logo pixels (used before smooth downscale).
 * Accepts white-on-transparent outlines/fills or colored logos; dark backgrounds become transparent.
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
    // nativeImage bitmaps are premultiplied: a transparent pixel must be 0,0,0,0 whatever the fill.
    const value = isLogo ? channel : 0
    bitmap[i] = value
    bitmap[i + 1] = value
    bitmap[i + 2] = value
    bitmap[i + 3] = isLogo ? 255 : 0
  }
}

/**
 * Keep RGB solid after smooth resize; preserve antialiased alpha.
 * nativeImage bitmaps are premultiplied BGRA, so white is written as RGB = alpha (255,255,255,0
 * is not "transparent white": Skia turns such pixels into an opaque white square).
 */
export function keepBlackPreserveAlpha(
  bitmap: Buffer,
  fill: TraySilhouetteFill = 'black',
): void {
  for (let i = 0; i < bitmap.length; i += 4) {
    const value = fill === 'white' ? (bitmap[i + 3] ?? 0) : 0
    bitmap[i] = value
    bitmap[i + 1] = value
    bitmap[i + 2] = value
  }
}

/**
 * Normalize alpha so thin outline strokes stay crisp after downscale
 * (otherwise partial coverage washes out to a faint tray glyph).
 */
export function strengthenTrayAlpha(bitmap: Buffer): void {
  let maxAlpha = 0
  for (let i = 3; i < bitmap.length; i += 4) {
    const a = bitmap[i] ?? 0
    if (a > maxAlpha) maxAlpha = a
  }
  if (maxAlpha <= 0 || maxAlpha >= 250) return

  const scale = 255 / maxAlpha
  for (let i = 3; i < bitmap.length; i += 4) {
    const a = bitmap[i] ?? 0
    if (a > 0) bitmap[i] = Math.min(255, Math.round(a * scale))
  }
}

function solidSmoothTraySize(
  mask: NativeImage,
  size: number,
  fill: TraySilhouetteFill = 'black',
): NativeImage {
  const resized = mask.resize({width: size, height: size, quality: 'best'})
  const bitmap = Buffer.from(resized.toBitmap())
  strengthenTrayAlpha(bitmap)
  keepBlackPreserveAlpha(bitmap, fill)  // after the alpha is final: premultiplied white follows it
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
 * Build a Retina-ready menu-bar template from the tray glyph (outline or fill),
 * via hi-res mask → downscale (16@1x + 32@2x). macOS tints this automatically.
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
 * Uses the same outline/fill mask as macOS, tinted for the OS theme.
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

/** Tray icon sizes Windows asks for at 100%-400% scaling (16 px * scale). */
const WINDOWS_TRAY_SIZES = [16, 20, 24, 32, 40, 48, 64]

/** The colored app icon at every Windows tray size, as an .ico in userData; null on failure. */
export function writeWindowsColorTrayIco(appRoot: string): string | null {
  try {
    const source = [path.join(appRoot, 'dist/icons/icon.png'), path.join(appRoot, 'public/icons/icon.png')]
      .find(candidate => fs.existsSync(candidate))
    if (!source) return null
    const image = nativeImage.createFromPath(source)
    if (image.isEmpty()) return null
    const ico = buildIco(WINDOWS_TRAY_SIZES.map(size => ({
      size,
      png: image.resize({width: size, height: size, quality: 'best'}).toPNG(),
    })))
    const file = path.join(app.getPath('userData'), 'tray-color.ico')
    fs.writeFileSync(file, ico)
    return file
  } catch (error) {
    console.warn('Failed to build the colored Windows tray icon:', error)
    return null
  }
}

/** An .ico file holding the given PNG images (PNG entries are supported since Windows Vista). */
export function buildIco(images: Array<{size: number; png: Buffer}>): Buffer {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0)  // reserved
  header.writeUInt16LE(1, 2)  // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({size, png}, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry)      // width (0 means 256)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)  // height
    header.writeUInt8(0, entry + 2)                       // palette size
    header.writeUInt8(0, entry + 3)                       // reserved
    header.writeUInt16LE(1, entry + 4)                    // color planes
    header.writeUInt16LE(32, entry + 6)                   // bits per pixel
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(image => image.png)])
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
  let trayMenu: Menu | null = null
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
    trayMenu = Menu.buildFromTemplate(buildTrayMenuTemplate(menuDeps()))
    // On macOS the menu is popped up manually (see click handlers) so it still
    // opens when another app owns a fullscreen Space.
    if (platform !== 'darwin') tray.setContextMenu(trayMenu)
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
        const popUp = () => {
          if (!tray || !trayMenu) return
          try {
            tray.popUpContextMenu(trayMenu)
          } catch (error) {
            console.warn('Failed to pop up tray menu:', error)
          }
        }
        tray.on('click', popUp)
        tray.on('right-click', popUp)
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
