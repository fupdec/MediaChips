// Builds native/mpv-view (the libmpv addon) with node-gyp on macOS and Windows.
// The addon uses N-API, so it does not have to be rebuilt per Electron version.
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = ['rebuild', '-C', 'native/mpv-view']
// Reuse the headers of the installed Node instead of downloading them (not available on Windows,
// where node-gyp fetches the matching node.lib itself).
if (process.platform !== 'win32') args.push(`--nodedir=${path.dirname(path.dirname(process.execPath))}`)

const result = spawnSync('node-gyp', args, {cwd: root, stdio: 'inherit', shell: true})
process.exit(result.status ?? 1)
