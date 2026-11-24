import fs from 'fs'
import path from 'path'
import {BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent} from 'electron'

/**
 * Native mpv playback (macOS and Windows).
 *
 * macOS: libmpv renders into an NSView placed under Chromium's web view.
 * Windows: mpv plays into a separate window under the transparent Electron window (which is an
 * owned window of it), so the main process also re-applies the rectangle when the window moves.
 * The renderer keeps the rectangle in sync with a DOM block (see native/mpv-view). Everything here
 * is opt-in: the addon and libmpv are loaded lazily, and any failure leaves the regular <video>
 * player untouched.
 */

type MpvViewInstance = {
  setRect: (x: number, y: number, w: number, h: number, cx: number, cy: number, cw: number, ch: number) => void
  command: (args: string[]) => number
  setProperty: (name: string, value: string) => number
  observe: (name: string, kind: 'double' | 'flag' | 'string') => void
  getProperty: (name: string) => string | null
  onEvent: (callback: (json: string) => void) => void
  destroy: () => void
}

type MpvViewConstructor = new (handle: Buffer, libPath: string, options?: {above?: boolean}) => MpvViewInstance

/** `supported`: the addon and libmpv are present (the setting can be offered); `available`: also switched on. */
export type MpvAvailability = {available: boolean; supported: boolean; reason?: string}

export type MpvTrack = {
  id: number
  type: 'video' | 'audio' | 'sub'
  lang: string
  title: string
  codec: string
  selected: boolean
  default: boolean
  forced: boolean
  external: boolean
}

/** Reads mpv's track list property by property (the addon only exposes scalar values). */
export function readTracks(read: (name: string) => string | null): MpvTrack[] {
  const count = Number(read('track-list/count')) || 0
  const tracks: MpvTrack[] = []
  for (let index = 0; index < count; index++) {
    const field = (name: string) => read(`track-list/${index}/${name}`) ?? ''
    const type = field('type')
    if (type !== 'video' && type !== 'audio' && type !== 'sub') continue
    tracks.push({
      id: Number(field('id')),
      type,
      lang: field('lang'),
      title: field('title'),
      codec: field('codec'),
      selected: field('selected') === 'yes',
      default: field('default') === 'yes',
      forced: field('forced') === 'yes',
      external: field('external') === 'yes',
    })
  }
  return tracks
}

/**
 * mpv reports `time-pos` on every frame, but the UI only needs a few updates a second: sending all
 * of them wakes the main process and the renderer 30-60 times a second for nothing. The latest
 * value of a throttled property is always delivered (trailing edge), so a pause or a seek still ends
 * on the exact position.
 */
const THROTTLED_PROPERTIES: Record<string, number> = {'time-pos': 100, 'demuxer-cache-time': 500}

export function createEventThrottle(
  send: (json: string) => void,
  now: () => number = Date.now,
): (json: string) => void {
  const last = new Map<string, number>()
  const pending = new Map<string, {json: string; timer: ReturnType<typeof setTimeout>}>()
  return (json: string) => {
    const name = Object.keys(THROTTLED_PROPERTIES).find(property => json.includes(`"name":"${property}"`))
    if (!name) {
      send(json)
      return
    }
    const wait = THROTTLED_PROPERTIES[name]
    const elapsed = now() - (last.get(name) ?? 0)
    const waiting = pending.get(name)
    if (elapsed >= wait && !waiting) {
      last.set(name, now())
      send(json)
      return
    }
    if (waiting) {
      waiting.json = json
      return
    }
    const entry = {
      json,
      timer: setTimeout(() => {
        pending.delete(name)
        last.set(name, now())
        send(entry.json)
      }, Math.max(0, wait - elapsed)),
    }
    pending.set(name, entry)
  }
}

export type MpvInitResult = {ok: true} | {ok: false; error: string}

const OBSERVED_PROPERTIES: Array<[string, 'double' | 'flag' | 'string']> = [
  ['pause', 'flag'],
  ['time-pos', 'double'],
  ['duration', 'double'],
  ['volume', 'double'],
  ['mute', 'flag'],
  ['speed', 'double'],
  ['eof-reached', 'flag'],
  ['seeking', 'flag'],
  ['paused-for-cache', 'flag'],
  ['demuxer-cache-time', 'double'],
  ['width', 'double'],
  ['height', 'double'],
  ['video-codec', 'string'],
  ['hwdec-current', 'string'],
  ['track-list/count', 'double'],
]

/** Remote sources (NAS, Drive, cloud) are slow and bursty: buffer more and wait longer than defaults. */
const NETWORK_TUNING: Array<[string, string]> = [
  ['cache', 'yes'],
  ['demuxer-max-bytes', '150MiB'],
  ['demuxer-max-back-bytes', '50MiB'],
  ['demuxer-readahead-secs', '30'],
  ['network-timeout', '30'],
  // Keep one HTTP connection across seeks instead of opening a new request each time.
  ['stream-lavf-o', 'multiple_requests=1'],
]

/** Opt-in: env var for development, `nativePlayer` in the shell config file for users. */
export function isNativePlayerEnabled(
  config: Record<string, unknown> | null | undefined,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (platform !== 'darwin' && platform !== 'win32') return false
  return env.MC_NATIVE_PLAYER === '1' || config?.nativePlayer === '1'
}

export function resolveMpvAddonPath(appRoot: string, resourcesPath: string | undefined): string | null {
  const candidates = [
    path.join(appRoot, 'native', 'mpv-view', 'build', 'Release', 'mpvview.node'),
    resourcesPath ? path.join(resourcesPath, 'mpv', 'mpvview.node') : '',
  ].filter(Boolean)
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

export function resolveLibmpvPath(
  resourcesPath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const candidates = platform === 'win32'
    ? [
        env.MPV_LIB,
        resourcesPath ? path.join(resourcesPath, 'mpv', 'libmpv-2.dll') : '',
        resourcesPath ? path.join(resourcesPath, 'mpv', 'mpv-2.dll') : '',
        path.join(process.cwd(), 'native', 'mpv-view', 'lib', 'libmpv-2.dll'),
      ]
    : [
        env.MPV_LIB,
        resourcesPath ? path.join(resourcesPath, 'mpv', 'libmpv.2.dylib') : '',
        '/opt/homebrew/lib/libmpv.2.dylib',
        '/opt/homebrew/lib/libmpv.dylib',
        '/usr/local/lib/libmpv.2.dylib',
        '/usr/local/lib/libmpv.dylib',
      ]
  return candidates
    .filter((candidate): candidate is string => Boolean(candidate))
    .find(candidate => fs.existsSync(candidate)) ?? null
}

export function createMpvNativeController(deps: {
  enabled: boolean
  appRoot: string
  resourcesPath?: string
}) {
  const views = new Map<number, MpvViewInstance>()
  /** Last rectangle (CSS px) each renderer asked for; re-applied when the window moves (Windows). */
  const lastRects = new Map<number, Record<string, number>>()
  let ViewClass: MpvViewConstructor | null = null
  let loadError = ''

  function loadAddon(): MpvViewConstructor | null {
    if (ViewClass) return ViewClass
    const addonPath = resolveMpvAddonPath(deps.appRoot, deps.resourcesPath)
    if (!addonPath) {
      loadError = 'mpvview.node is not built (npm run spike:mpv-native:build)'
      return null
    }
    try {
      ViewClass = require(addonPath).MpvView as MpvViewConstructor
      return ViewClass
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  function getAvailability(): MpvAvailability {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return {available: false, supported: false, reason: 'macOS and Windows only'}
    }
    if (!resolveLibmpvPath(deps.resourcesPath)) return {available: false, supported: false, reason: 'libmpv not found'}
    if (!loadAddon()) return {available: false, supported: false, reason: loadError}
    if (!deps.enabled) return {available: false, supported: true, reason: 'disabled'}
    return {available: true, supported: true}
  }

  function destroyView(webContentsId: number) {
    lastRects.delete(webContentsId)
    const view = views.get(webContentsId)
    if (!view) return
    views.delete(webContentsId)
    try {
      view.destroy()
    } catch (error) {
      console.warn('[mpv] destroy failed:', error)
    }
  }

  /** CSS pixels -> view units: the app zoom (webContents zoom factor) scales the page. */
  function applyRect(contentsId: number, zoom: number, rect: Record<string, number> | null) {
    const view = views.get(contentsId)
    if (!view || !rect) return
    const z = zoom || 1
    view.setRect(rect.x * z, rect.y * z, rect.w * z, rect.h * z, rect.cx * z, rect.cy * z, rect.cw * z, rect.ch * z)
  }

  /**
   * Windows only: the video host is a separate top-level window, so it does not follow the Electron
   * window by itself. Hide it while that window is minimized or hidden and re-place it after moves.
   */
  function trackWindow(win: BrowserWindow, contentsId: number) {
    if (process.platform !== 'win32') return
    const hidden = {x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, cw: 0, ch: 0}
    const sync = () => {
      if (win.isDestroyed() || !views.has(contentsId)) return
      const visible = win.isVisible() && !win.isMinimized()
      applyRect(contentsId, win.webContents.getZoomFactor(), visible ? lastRects.get(contentsId) ?? null : hidden)
    }
    for (const name of ['move', 'resize', 'maximize', 'unmaximize', 'minimize', 'restore', 'show', 'hide', 'enter-full-screen', 'leave-full-screen'] as const) {
      win.on(name as 'move', sync)
    }
  }

  function init(event: IpcMainInvokeEvent, options?: {above?: boolean}): MpvInitResult {
    const availability = getAvailability()
    if (!availability.available) return {ok: false, error: availability.reason || 'unavailable'}
    const win = BrowserWindow.fromWebContents(event.sender)
    const libPath = resolveLibmpvPath(deps.resourcesPath)
    if (!win || !libPath || !ViewClass) return {ok: false, error: 'no window'}

    const contentsId = event.sender.id
    destroyView(contentsId)
    try {
      const view = new ViewClass(win.getNativeWindowHandle(), libPath, {above: Boolean(options?.above)})
      const send = (json: string) => {
        if (!event.sender.isDestroyed()) event.sender.send('mpv:event', json)
      }
      const throttle = createEventThrottle(send)
      view.onEvent(json => {
        // Lifecycle events only: time-pos and the other property changes are far too frequent to log.
        if (json.includes('"file-loaded"') || json.includes('"end-file"')) console.log(`[mpv] event ${json}`)
        throttle(json)
      })
      for (const [name, kind] of OBSERVED_PROPERTIES) view.observe(name, kind)
      for (const [name, value] of NETWORK_TUNING) {
        const rc = view.setProperty(name, value)
        if (rc < 0) console.warn(`[mpv] option ${name}=${value} rejected (rc=${rc})`)
      }
      views.set(contentsId, view)
      console.log(`[mpv] view created for window ${contentsId}`)
      // Release the view while the window is still alive; `closed` is a fallback.
      trackWindow(win, contentsId)
      win.once('close', () => destroyView(contentsId))
      win.once('closed', () => destroyView(contentsId))
      return {ok: true}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[mpv] view creation failed: ${message}`)
      return {ok: false, error: message}
    }
  }

  function registerIpc() {
    if (deps.enabled) {
      const availability = getAvailability()
      console.log(`[mpv] native player enabled; available=${availability.available}${availability.reason ? ` (${availability.reason})` : ''}`)
    }
    ipcMain.handle('mpv:availability', () => getAvailability())
    ipcMain.handle('mpv:init', init)
    ipcMain.handle('mpv:tracks', (event: IpcMainInvokeEvent) => {
      const view = views.get(event.sender.id)
      return view ? readTracks(name => view.getProperty(name)) : []
    })
    ipcMain.handle('mpv:destroy', (event: IpcMainInvokeEvent) => destroyView(event.sender.id))
    ipcMain.handle('mpv:command', (event: IpcMainInvokeEvent, command: unknown) => {
      if (!Array.isArray(command) || command.some(part => typeof part !== 'string')) return -1
      const rc = views.get(event.sender.id)?.command(command as string[]) ?? -1
      if (command[0] === 'loadfile') {
        const url = String(command[1]).replace(/([?&])(?:token|auth)[^&]*/gi, '$1[redacted]')
        console.log(`[mpv] loadfile ${url} options=${command.slice(2).join(' ') || '-'} rc=${rc}`)
      } else if (command[0] === 'seek') {
        // A refused seek (rc -12) is normal while a file is opening; the renderer retries it.
        console.log(`[mpv] seek ${command[1]} rc=${rc}`)
      } else if (rc < 0) {
        console.warn(`[mpv] command ${command[0]} failed (rc=${rc})`)
      }
      return rc
    })
    ipcMain.handle('mpv:set-property', (event: IpcMainInvokeEvent, name: unknown, value: unknown) => {
      if (typeof name !== 'string') return -1
      const view = views.get(event.sender.id)
      const rc = view?.setProperty(name, String(value)) ?? -1
      if (name === 'pause' || rc < 0) console.log(`[mpv] set ${name}=${String(value)} rc=${rc}${view ? '' : ' (no view for this window)'}`)
      return rc
    })
    ipcMain.on('mpv:rect', (event: IpcMainEvent, rect: unknown) => {
      const r = rect as Record<string, number> | null
      if (!r) return
      lastRects.set(event.sender.id, r)
      applyRect(event.sender.id, event.sender.getZoomFactor(), r)
    })
  }

  function destroyAll() {
    for (const id of [...views.keys()]) destroyView(id)
  }

  return {registerIpc, getAvailability, destroyAll}
}
