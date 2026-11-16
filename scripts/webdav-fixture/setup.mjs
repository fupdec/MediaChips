// Isolated disposable servers; run `node scripts/webdav-fixture/setup.mjs down` to remove them.
import {execFileSync} from 'node:child_process'
import {mkdirSync, writeFileSync, existsSync} from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import {fileURLToPath} from 'node:url'
import ffmpeg from 'ffmpeg-static'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const directory = path.join(root, '.cache/webdav-acceptance')
const compose = ['compose', '-p', 'mediachips-webdav-acceptance', '-f', path.join(root, 'scripts/webdav-fixture/compose.yml')]
const env = {...process.env, WEBDAV_FIXTURE_DIR: directory}
const docker = (...args) => execFileSync('docker', args, {env, stdio: 'inherit'})
if (process.argv[2] === 'down') { docker(...compose, 'down', '-v'); process.exit() }
mkdirSync(path.join(directory, 'files/Кино & тест'), {recursive: true})
if (!existsSync(path.join(directory, 'cert.pem'))) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '7', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', path.join(directory, 'key.pem'), '-out', path.join(directory, 'cert.pem')], {stdio: 'ignore'})
writeFileSync(path.join(directory, 'htpasswd'), execFileSync('docker', ['run', '--rm', 'httpd:2.4-alpine', 'htpasswd', '-nbB', 'reader', 'webdav-acceptance-password']))
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', path.join(directory, 'files/Кино & тест/video 100% #.mp4')])
docker(...compose, 'up', '-d')
const {readFileSync} = await import('node:fs')
const ca = readFileSync(path.join(directory, 'cert.pem'))
const request = (port, url, method = 'GET', body) => new Promise((resolve, reject) => {
  const req = https.request({host: '127.0.0.1', port, path: url, method, ca, auth: 'reader:webdav-acceptance-password'}, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode))
  })
  req.on('error', reject); req.setTimeout(3000, () => req.destroy(new Error('timeout'))); req.end(body)
})
let ready = false
for (let i = 0; i < 120; i++) {
  try { if (await request(18443, '/status.php') === 200 && await request(18443, '/remote.php/dav/files/reader/', 'PROPFIND') === 207) { ready = true; break } } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000))
}
if (!ready) throw new Error('Nextcloud did not become ready')
const folder = '/remote.php/dav/files/reader/' + encodeURIComponent('Кино & тест')
const created = await request(18443, folder, 'MKCOL')
if (![201, 405].includes(created)) throw new Error(`MKCOL failed: ${created}`)
const uploaded = await request(18443, folder + '/' + encodeURIComponent('video 100% #.mp4'), 'PUT', readFileSync(path.join(directory, 'files/Кино & тест/video 100% #.mp4')))
if (![201, 204].includes(uploaded)) throw new Error(`PUT failed: ${uploaded}`)
console.log(`WebDAV servers ready. CA: ${directory}/cert.pem`)
console.log('Nextcloud: https://127.0.0.1:18443/remote.php/dav/files/reader/; Apache: https://127.0.0.1:18444/dav/')
