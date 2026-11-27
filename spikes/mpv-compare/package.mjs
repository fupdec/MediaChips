#!/usr/bin/env node
// Builds a portable Windows zip of the comparison prototype for testers: no Node, Python or
// compiler needed on their machine.
//
//   npm run spike:mpv-compare:build      # mpvcompare.node
//   npm run spike:mpv-compare:package    # -> spikes/mpv-compare/out/MediaChips-mpv-compare-win-x64.zip
import {spawnSync} from 'node:child_process'
import {copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const name = 'MediaChips-mpv-compare-win-x64'
const outRoot = path.join(here, 'out')
const outDir = path.join(outRoot, name)
const appDir = path.join(outDir, 'resources', 'app')

function fail(message) {
  console.error(`[package] ${message}`)
  process.exit(1)
}

const electronDist = path.join(root, 'node_modules', 'electron', 'dist')
const addon = path.join(here, 'native', 'build', 'Release', 'mpvcompare.node')
const libmpv = [process.env.MPV_LIB, path.join(root, 'native', 'mpv-view', 'lib', 'libmpv-2.dll')].find(p => p && existsSync(p))
const ffmpeg = path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')

if (process.platform !== 'win32') fail('Windows only')
if (!existsSync(path.join(electronDist, 'electron.exe'))) fail('node_modules/electron/dist is missing')
if (!existsSync(addon)) fail('mpvcompare.node is missing: run npm run spike:mpv-compare:build')
if (!libmpv) fail('libmpv-2.dll is missing: put it in native/mpv-view/lib or set MPV_LIB')

rmSync(outRoot, {recursive: true, force: true})
mkdirSync(outRoot, {recursive: true})

console.log('[package] copying Electron...')
cpSync(electronDist, outDir, {recursive: true})
rmSync(path.join(outDir, 'resources', 'default_app.asar'), {force: true})
renameSync(path.join(outDir, 'electron.exe'), path.join(outDir, 'MediaChips mpv compare.exe'))

console.log('[package] copying the prototype...')
mkdirSync(appDir, {recursive: true})
for (const file of ['main.js', 'index.html', 'package.json']) copyFileSync(path.join(here, file), path.join(appDir, file))
copyFileSync(addon, path.join(appDir, 'mpvcompare.node'))
copyFileSync(libmpv, path.join(appDir, 'libmpv-2.dll'))

// The same synthetic clips for every tester: moving patterns make stutter easy to see and compare.
const clipsDir = path.join(appDir, 'clips')
mkdirSync(clipsDir, {recursive: true})
if (existsSync(ffmpeg)) {
  for (const [file, rate] of [['test-1080p60.mp4', '60'], ['test-1080p24.mp4', '24000/1001']]) {
    console.log(`[package] generating ${file}...`)
    const result = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=${rate},format=yuv420p`,
      '-t', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      path.join(clipsDir, file),
    ], {stdio: 'inherit'})
    if (result.status !== 0) fail(`ffmpeg failed for ${file}`)
  }
} else {
  console.warn('[package] ffmpeg-static not found: the zip will have no test clips')
}

const readme = `MediaChips - mpv playback comparison (prototype)
================================================

RU
--
1. Распакуйте архив целиком в любую папку и запустите "MediaChips mpv compare.exe".
2. Нажмите "Open video…". Откроется папка clips с двумя тестовыми роликами (60 и 24 кадра/с).
   Можно выбрать и своё видео, лучше всего 1080p или 4K.
3. Нажмите "Compare both modes". Видео проиграется по очереди в двух режимах, по 60 секунд в каждом:
     Native window      - так плеер работает сейчас (mpv рисует в своё окно);
     Texture -> canvas  - новый вариант (mpv рисует в текстуру, видео становится частью страницы).
   Смотрите на плавность. Во время теста можно менять размер окна: в режиме Texture полоса внизу
   должна оставаться приклеенной к видео.
4. Справа оцените оба режима (1-5), напишите комментарий и нажмите "Save report…".
5. Пришлите сохранённый JSON-файл. Если что-то не запустилось, приложите ещё логи mpv:
   %APPDATA%\\MediaChips mpv compare\\mpv-native.log и mpv-texture.log

EN
--
1. Unzip everything and run "MediaChips mpv compare.exe".
2. "Open video…" opens the clips folder (60 and 24 fps test clips); your own 1080p/4K video works too.
3. "Compare both modes" plays the video 60 s in each mode: Native window (how the player works today)
   and Texture -> canvas (the video becomes part of the page). You may resize the window meanwhile.
4. Rate both modes on the right, add a comment, "Save report…", and send the JSON file
   (plus %APPDATA%\\MediaChips mpv compare\\mpv-*.log if something failed).

Licenses: libmpv (GPL-2.0-or-later), Electron (MIT), this prototype (GPL-3.0-or-later).
`
writeFileSync(path.join(outDir, 'README.txt'), readme.replace(/\n/g, '\r\n'))

console.log('[package] zipping...')
const zip = path.join(outRoot, `${name}.zip`)
// Windows' own bsdtar writes zip files; a GNU tar earlier in PATH (Git) would not.
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
const result = spawnSync(tar, ['-a', '-c', '-f', zip, '-C', outRoot, name], {stdio: 'inherit'})
if (result.status !== 0) fail('tar failed')
console.log(`[package] ${zip} (${(statSync(zip).size / 1024 / 1024).toFixed(0)} MB)`)
