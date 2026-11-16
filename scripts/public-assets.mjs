import fs from 'node:fs'
import path from 'node:path'

/** Ship only static UI assets; public/ also contains host-local runtime data. */
export function collectPublicAssets(publicDir) {
  const files = []
  const extensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.icns', '.webmanifest', '.woff2'])
  function collect(relative) {
    const absolute = path.join(publicDir, relative)
    const info = fs.lstatSync(absolute, {throwIfNoEntry: false})
    if (info?.isDirectory()) {
      for (const name of fs.readdirSync(absolute)) collect(path.join(relative, name))
    } else if (info?.isFile() && (relative === 'loading.html' || extensions.has(path.extname(relative).toLowerCase()))) {
      files.push({fileName: relative.split(path.sep).join('/'), source: fs.readFileSync(absolute)})
    }
  }
  for (const relative of ['icons', 'images', 'loading.html']) collect(relative)
  return files
}

export function staticPublicAssets(publicDir) {
  return {
    name: 'static-public-assets',
    apply: 'build',
    buildStart() {
      for (const asset of collectPublicAssets(publicDir)) this.emitFile({type: 'asset', ...asset})
    },
  }
}
