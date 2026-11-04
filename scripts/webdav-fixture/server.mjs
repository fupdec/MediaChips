// Run a disposable app library so acceptance never touches the user's running instance.
import {spawn, execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const directory = mkdtempSync(path.join(os.tmpdir(), 'mc-webdav-browser-'))
execFileSync('node', ['scripts/compile.mjs', 'backend'], {stdio: 'inherit'})
execFileSync('npm', ['run', 'build:app'], {stdio: 'inherit'})
writeFileSync(path.join(directory, 'config.json'), JSON.stringify({port: 18445,
  databases: [{id: 'webdav-acceptance', name: 'WebDAV acceptance', active: true, createdAt: Date.now()}],
  onboardingCompleted: '1', onboardingPaused: '0', onboardingStep: '0',
  seenFeatureHints: 'network-sources,edit-library-nav,drag-tags-between-cards',
  lastSeenVersion: JSON.parse(readFileSync('package.json', 'utf8')).version}))
const server = spawn('node', ['.backend-build/app/server.js'], {stdio: 'inherit', env: {...process.env,
  NODE_ENV: 'production', MEDIA_CHIPS_DATA_DIR: directory, MEDIA_CHIPS_ALLOW_LAN: '0',
  NODE_EXTRA_CA_CERTS: path.resolve('.cache/webdav-acceptance/cert.pem')}})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', code => { rmSync(directory, {recursive: true, force: true}); process.exit(code || 0) })
