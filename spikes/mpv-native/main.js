// Prototype: libmpv inside the Electron window, under a transparent web layer.
//
//   npm run spike:mpv-native -- /path/to/video [--above]
//
// Two window modes share one native layer:
//   embedded: video follows a block inside a page layout (sidebar, scroll, overlays)
//   window:   same page, the block fills a separate window ("Open in window" button)
const {app, BrowserWindow, ipcMain} = require('electron')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const above = args.includes('--above')
// Reproduce the real main window options: native frame + hidden title bar + traffic lights.
const likeMain = args.includes('--like-main')
// Same as --like-main but NOT transparent (control case).
const opaque = args.includes('--opaque')

const LIB_CANDIDATES = [
  process.env.MPV_LIB,
  '/opt/homebrew/lib/libmpv.2.dylib',
  '/opt/homebrew/lib/libmpv.dylib',
  '/usr/local/lib/libmpv.2.dylib',
  '/usr/local/lib/libmpv.dylib',
].filter(Boolean)
const libPath = LIB_CANDIDATES.find(candidate => fs.existsSync(candidate))

const {MpvView} = require('../../native/mpv-view/build/Release/mpvview.node')
const views = new Map()

function createWindow(mode) {
  const mainLike = (likeMain || opaque) && mode === 'embedded'
  const win = new BrowserWindow({
    width: mode === 'window' ? 960 : 1280,
    height: mode === 'window' ? 600 : 780,
    ...(mainLike
      ? {
          frame: true,
          titleBarStyle: 'hidden',
          trafficLightPosition: {x: 18, y: 15},
          transparent: !opaque,
          backgroundColor: opaque ? '#333333' : '#00000000',
        }
      : {frame: false, transparent: true, hasShadow: true, backgroundColor: '#00000000'}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'), {query: {mode}})
  const contentsId = win.webContents.id
  win.on('close', () => destroyView(contentsId))
  win.on('closed', () => destroyView(contentsId))
  return win
}

function destroyView(id) {
  const view = views.get(id)
  if (view) {
    try { view.destroy() } catch { /* already gone */ }
    views.delete(id)
  }
}

ipcMain.handle('player:init', event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return {error: 'no window'}
  if (!libPath) return {error: 'libmpv not found. Run: brew install mpv (or set MPV_LIB)'}
  destroyView(event.sender.id)
  try {
    const view = new MpvView(win.getNativeWindowHandle(), libPath, {above})
    view.onEvent(json => {
      if (!event.sender.isDestroyed()) event.sender.send('player:event', json)
    })
    view.observe('pause', 'flag')
    view.observe('time-pos', 'double')
    view.observe('duration', 'double')
    view.observe('video-codec', 'string')
    view.observe('hwdec-current', 'string')
    views.set(event.sender.id, view)
    if (file) view.command(['loadfile', file])
    return {ok: true, libPath, above, file}
  } catch (error) {
    return {error: String(error && error.message || error)}
  }
})

ipcMain.on('player:rect', (event, r) => {
  views.get(event.sender.id)?.setRect(r.x, r.y, r.w, r.h, r.cx, r.cy, r.cw, r.ch)
})
ipcMain.on('player:cmd', (event, command) => {
  views.get(event.sender.id)?.command(command)
})
ipcMain.on('player:window', () => {
  const win = createWindow('window')
  win.setTitle('mpv spike window')
})
ipcMain.on('player:close', event => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

app.whenReady().then(() => {
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run spike:mpv-native -- /path/to/video [--above]')
    app.exit(1)
    return
  }
  createWindow('embedded')
})
app.on('window-all-closed', () => app.quit())
