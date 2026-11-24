// Prototype: play any video through an external mpv process while the UI is HTML.
//
//   npm run spike:mpv -- /path/to/video.mkv [--mode=overlay|wid]
//
// overlay (default): mpv gets its own borderless window; a transparent, always-on-top
//   Electron window with HTML controls sits exactly over it.
// wid: mpv is asked to render into a child window of the Electron host via --wid
//   (works only where mpv supports embedding; macOS support is the thing we test).
//
// Not wired into the app. Delete the folder to remove it.
const {app, BrowserWindow, ipcMain, screen} = require('electron')
const {spawn} = require('child_process')
const net = require('net')
const os = require('os')
const path = require('path')
const fs = require('fs')

const argv = process.argv.slice(2).filter(a => !a.startsWith('--') || a.startsWith('--mode='))
const modeArg = argv.find(a => a.startsWith('--mode='))
const mode = modeArg ? modeArg.slice('--mode='.length) : 'overlay'
const file = argv.find(a => !a.startsWith('--'))
const APP_BUNDLE_MPV = '/Applications/mpv.app/Contents/MacOS/mpv'
const mpvBin = process.env.MPV_PATH || (fs.existsSync(APP_BUNDLE_MPV) ? APP_BUNDLE_MPV : 'mpv')
const socketPath = path.join(os.tmpdir(), `mc-mpv-spike-${process.pid}.sock`)

let host = null
let mpv = null
let ipc = null
let requestId = 0
const state = {pause: true, timePos: 0, duration: 0, videoCodec: '', audioCodec: '', hwdec: '', size: ''}

function log(message) {
  console.log('[mpv-spike]', message)
  host?.webContents.send('spike:log', message)
}

function send(command) {
  if (!ipc || ipc.destroyed) return
  ipc.write(JSON.stringify({command, request_id: ++requestId}) + '\n')
}

function pushState() {
  host?.webContents.send('spike:state', state)
}

function onMpvMessage(msg) {
  if (msg.event === 'property-change') {
    const map = {
      pause: 'pause',
      'time-pos': 'timePos',
      duration: 'duration',
      'video-codec': 'videoCodec',
      'audio-codec-name': 'audioCodec',
      'hwdec-current': 'hwdec',
    }
    const key = map[msg.name]
    if (key) state[key] = msg.data ?? (key === 'pause' ? true : '')
    pushState()
  } else if (msg.event === 'file-loaded') {
    log('file-loaded')
  } else if (msg.event === 'end-file') {
    log(`end-file: ${msg.reason || ''} ${msg.file_error || ''}`)
  }
}

function connectIpc(attempt = 0) {
  const socket = net.createConnection(socketPath)
  socket.once('connect', () => {
    ipc = socket
    let buffer = ''
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (!line) continue
        try { onMpvMessage(JSON.parse(line)) } catch { /* ignore partial */ }
      }
    })
    for (const name of ['pause', 'time-pos', 'duration', 'video-codec', 'audio-codec-name', 'hwdec-current']) {
      send(['observe_property', 1, name])
    }
    log('connected to mpv ipc')
  })
  socket.once('error', () => {
    socket.destroy()
    if (attempt < 50) setTimeout(() => connectIpc(attempt + 1), 100)
    else log('could not connect to mpv ipc')
  })
}

function contentBounds() {
  const b = host.getContentBounds()
  return {x: b.x, y: b.y, width: b.width, height: b.height}
}

/** mpv reads --geometry in device pixels; Electron reports points. */
function mpvGeometry() {
  const b = contentBounds()
  const scale = screen.getDisplayMatching(host.getBounds()).scaleFactor || 1
  const px = value => Math.round(value * scale)
  return `${px(b.width)}x${px(b.height)}+${px(b.x)}+${px(b.y)}`
}

function syncMpvGeometry() {
  if (mode !== 'overlay' || !host) return
  send(['set_property', 'geometry', mpvGeometry()])
}

function startMpv() {
  const args = [
    file,
    `--input-ipc-server=${socketPath}`,
    '--idle=yes',
    '--keep-open=yes',
    '--no-osc',
    '--no-input-default-bindings',
    '--no-input-cursor',
    '--cursor-autohide=no',
    '--hwdec=auto-safe',
    '--force-window=yes',
    '--pause',
  ]
  if (mode === 'wid') {
    const handle = host.getNativeWindowHandle()
    const wid = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0))
    args.push(`--wid=${wid}`)
  } else {
    args.push('--no-border', `--geometry=${mpvGeometry()}`, '--no-keepaspect-window')
  }
  log(`spawn ${mpvBin} ${args.join(' ')}`)
  mpv = spawn(mpvBin, args, {stdio: ['ignore', 'inherit', 'inherit']})
  mpv.once('error', error => log(`mpv failed to start: ${error.message}. Install it (brew install mpv) or set MPV_PATH.`))
  mpv.once('exit', code => {
    log(`mpv exited (${code})`)
    app.quit()
  })
  connectIpc()
}

function createHost() {
  const overlay = mode === 'overlay'
  host = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    transparent: overlay,
    hasShadow: !overlay,
    backgroundColor: overlay ? '#00000000' : '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  if (overlay) host.setAlwaysOnTop(true, 'floating')
  host.on('move', syncMpvGeometry)
  host.on('resize', syncMpvGeometry)
  host.loadFile(path.join(__dirname, 'overlay.html'))
  host.webContents.once('did-finish-load', () => {
    log(`mode=${mode} electron=${process.versions.electron} chrome=${process.versions.chrome}`)
    startMpv()
  })
}

ipcMain.on('spike:command', (_event, command) => send(command))
ipcMain.on('spike:close', () => app.quit())

app.whenReady().then(() => {
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run spike:mpv -- /path/to/video [--mode=overlay|wid]')
    app.exit(1)
    return
  }
  createHost()
})

app.on('before-quit', () => {
  try { mpv?.kill() } catch { /* already gone */ }
  try { fs.unlinkSync(socketPath) } catch { /* not created */ }
})
app.on('window-all-closed', () => app.quit())
