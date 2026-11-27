// mpv playback comparison prototype (Windows).
//
//   native  - mpv draws into its own child window (what the app's player does today)
//   texture - mpv renders into shared D3D11 textures that the page draws on a <canvas>
//
// Dev:      npm run spike:mpv-compare:build && npm run spike:mpv-compare
// Testers:  the portable zip from `npm run spike:mpv-compare:package` (see README.md)
const {app, BrowserWindow, ipcMain, dialog, sharedTexture, screen} = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const here = __dirname
const firstExisting = candidates => candidates.filter(Boolean).find(candidate => fs.existsSync(candidate))
const addonPath = firstExisting([
  path.join(here, 'mpvcompare.node'),
  path.join(here, 'native', 'build', 'Release', 'mpvcompare.node'),
])
const libmpvPath = firstExisting([
  process.env.MPV_LIB,
  path.join(here, 'libmpv-2.dll'),
  path.join(here, '..', '..', 'native', 'mpv-view', 'lib', 'libmpv-2.dll'),
])
const angleDir = path.dirname(process.execPath)  // electron.exe ships libEGL.dll / libGLESv2.dll

const STAT_PROPS = [
  'frame-drop-count', 'decoder-frame-drop-count', 'vo-delayed-frame-count', 'mistimed-frame-count',
  'estimated-vf-fps', 'container-fps', 'display-fps', 'estimated-display-fps', 'video-sync',
  'avsync', 'total-avsync-change', 'hwdec-current', 'current-vo', 'video-codec', 'width', 'height',
  'time-pos', 'duration', 'pause', 'mpv-version',
]

let win = null
let session = null  // {mode, mpv, file, destroyed, main: {...}}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1100,
    minHeight: 600,
    backgroundColor: '#111111',
    title: 'MediaChips - mpv playback comparison',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })
  win.removeMenu()
  win.loadFile(path.join(here, 'index.html'))
  win.on('closed', () => {
    stopSession()
    win = null
  })
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function stopSession() {
  if (!session) return
  session.destroyed = true
  try {
    session.mpv.destroy()
  } catch (error) {
    console.warn('[compare] destroy failed', error)
  }
  session = null
}

function onTextureFrame(current, frame) {
  const mpv = current.mpv
  const release = () => { if (!current.destroyed) mpv.releaseTexture(frame.id) }
  if (current.destroyed || !win || win.isDestroyed()) return release()
  let imported
  try {
    imported = sharedTexture.importSharedTexture({
      textureInfo: {
        pixelFormat: 'bgra',
        codedSize: {width: frame.width, height: frame.height},
        handle: {ntHandle: frame.handle},
      },
      allReferencesReleased: release,
    })
  } catch (error) {
    current.main.importErrors++
    if (current.main.importErrors === 1) send('status', {error: `importSharedTexture failed: ${error.message}`})
    return release()
  }
  current.main.framesRendered++
  current.main.renderMsTotal += frame.renderMs
  current.main.renderMsMax = Math.max(current.main.renderMsMax, frame.renderMs)
  current.main.gpuMsTotal += frame.gpuMs
  current.main.gpuMsMax = Math.max(current.main.gpuMsMax, frame.gpuMs)
  const sentAt = performance.now()
  sharedTexture.sendSharedTexture({frame: win.webContents.mainFrame, importedSharedTexture: imported})
    .then(() => {
      const ms = performance.now() - sentAt
      current.main.sendMsTotal += ms
      current.main.sendMsMax = Math.max(current.main.sendMsMax, ms)
    })
    .catch(error => {
      current.main.sendErrors++
      if (current.main.sendErrors === 1) send('status', {error: `sendSharedTexture failed: ${error.message}`})
    })
    .finally(() => imported.release())
}

// Optional: --file <path> [--mode native|texture] [--autoplay] (handy for development)
const argValue = name => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

ipcMain.handle('environment', () => ({
  addonPath,
  libmpvPath,
  angleDir,
  platform: process.platform,
  file: argValue('--file'),
  mode: argValue('--mode'),
  autoplay: process.argv.includes('--autoplay'),
  compareSeconds: Number(argValue('--compare')) || 0,
  reportOut: argValue('--report-out'),
}))

// Dev: write the report without a dialog and quit (used with --compare and --report-out).
ipcMain.handle('write-report', (_event, filePath, report) => {
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2))
  app.quit()
})

ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    ...(fs.existsSync(path.join(here, 'clips')) ? {defaultPath: path.join(here, 'clips')} : {}),
    filters: [{name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'avi', 'wmv', 'webm', 'm4v', 'ts', 'flv', 'mpg', 'mpeg']}, {name: 'All files', extensions: ['*']}],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('start', (_event, {mode, file, flipY}) => {
  stopSession()
  if (!addonPath) return {ok: false, error: 'mpvcompare.node not found (npm run spike:mpv-compare:build)'}
  if (!libmpvPath) return {ok: false, error: 'libmpv-2.dll not found (native/mpv-view/lib or MPV_LIB)'}
  const {MpvCompare} = require(addonPath)
  const current = {
    mode,
    file,
    destroyed: false,
    main: {framesRendered: 0, renderMsTotal: 0, renderMsMax: 0, gpuMsTotal: 0, gpuMsMax: 0, sendMsTotal: 0, sendMsMax: 0, sendErrors: 0, importErrors: 0},
  }
  try {
    current.mpv = new MpvCompare({
      mode,
      libmpv: libmpvPath,
      angleDir,
      flipY: flipY === true,
      logFile: path.join(app.getPath('userData'), `mpv-${mode}.log`),
      hwnd: win.getNativeWindowHandle(),
      onEvent: json => {
        if (current.destroyed) return
        try {
          send('mpv-event', JSON.parse(json))
        } catch { /* ignore malformed */ }
      },
      onFrame: frame => onTextureFrame(current, frame),
    })
  } catch (error) {
    return {ok: false, error: error.message}
  }
  session = current
  const rc = current.mpv.command(['loadfile', file])
  return {ok: rc >= 0, error: rc < 0 ? `loadfile failed (${rc})` : undefined}
})

ipcMain.handle('stop', () => stopSession())

ipcMain.on('rect', (_event, rect) => {
  if (session?.mode === 'native') session.mpv.setRect(rect.x, rect.y, rect.width, rect.height)
})

ipcMain.on('size', (_event, size) => {
  if (session?.mode === 'texture') session.mpv.setSize(size.width, size.height)
})

ipcMain.handle('command', (_event, args) => session?.mpv.command(args.map(String)) ?? -1)
ipcMain.handle('set-property', (_event, name, value) => session?.mpv.setProperty(name, String(value)) ?? -1)

ipcMain.handle('stats', () => {
  if (!session) return null
  const props = {}
  for (const name of STAT_PROPS) props[name] = session.mpv.getProperty(name)
  return {mode: session.mode, props, main: {...session.main}}
})

ipcMain.handle('system-info', async () => {
  let gpu = null
  try {
    gpu = await app.getGPUInfo('basic')
  } catch { /* unavailable */ }
  const displays = screen.getAllDisplays().map(display => ({
    size: display.size,
    scaleFactor: display.scaleFactor,
    displayFrequency: display.displayFrequency,
    primary: display.id === screen.getPrimaryDisplay().id,
  }))
  return {
    os: `${os.type()} ${os.release()} (${process.getSystemVersion()})`,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    gpuDevices: gpu?.gpuDevice ?? null,
    displays,
  }
})

ipcMain.handle('save-report', async (_event, report) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const result = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('desktop'), `mpv-compare-report-${stamp}.json`),
    filters: [{name: 'JSON', extensions: ['json']}],
  })
  if (result.canceled || !result.filePath) return null
  fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2))
  return result.filePath
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
