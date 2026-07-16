import fs from 'fs'
import os from 'os'
import path from 'path'

export type SystemPlace = {
  id: string
  path: string
  name: string
  icon: string
}

const SKIP_VOLUME_NAMES = new Set([
  '.',
  '..',
  'lost+found',
  '@eaDir',
  '#recycle',
  '$RECYCLE.BIN',
  'System Volume Information',
  'cdrom',
  'floppy',
  'usb',
])

function isExistingDirectory(targetPath: string): boolean {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
  } catch {
    return false
  }
}

function pushPlace(
  places: SystemPlace[],
  seen: Set<string>,
  place: SystemPlace,
): void {
  const resolved = path.resolve(place.path)
  if (seen.has(resolved) || !isExistingDirectory(resolved)) return
  seen.add(resolved)
  places.push({...place, path: resolved})
}

function homeDir(): string | null {
  try {
    const home = os.homedir()
    return home ? path.resolve(home) : null
  } catch {
    return null
  }
}

function userChild(home: string, ...names: string[]): string | null {
  for (const name of names) {
    const candidate = path.join(home, name)
    if (isExistingDirectory(candidate)) return candidate
  }
  return null
}

function listWindowsDrivePlaces(): SystemPlace[] {
  const places: SystemPlace[] = []
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code)
    const root = `${letter}:\\`
    if (!isExistingDirectory(root)) continue
    places.push({
      id: `drive:${letter}`,
      path: root,
      name: `${letter}:`,
      icon: 'mdi-harddisk',
    })
  }
  return places
}

function listUnixVolumePlaces(parentPath: string, idPrefix: string): SystemPlace[] {
  if (!isExistingDirectory(parentPath)) return []

  try {
    return fs.readdirSync(parentPath, {withFileTypes: true})
      .filter((entry) => (
        entry.isDirectory()
        && !SKIP_VOLUME_NAMES.has(entry.name)
        && !entry.name.startsWith('.')
      ))
      .slice(0, 40)
      .map((entry) => ({
        id: `${idPrefix}:${entry.name}`,
        path: path.join(parentPath, entry.name),
        name: entry.name,
        icon: 'mdi-harddisk',
      }))
      .filter((place) => isExistingDirectory(place.path))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

function listLinuxUserMediaPlaces(home: string): SystemPlace[] {
  const userName = home ? path.basename(home) : ''
  const candidates = [
    userName ? path.join('/media', userName) : '',
    '/media',
    '/mnt',
  ].filter(Boolean)

  const places: SystemPlace[] = []
  const seenNames = new Set<string>()
  for (const candidate of candidates) {
    for (const place of listUnixVolumePlaces(candidate, 'volume')) {
      if (seenNames.has(place.path)) continue
      seenNames.add(place.path)
      places.push(place)
    }
  }
  return places
}

/**
 * Curated quick-access places for the folder browser (local / non-Docker).
 * Only paths that exist on the current OS are returned.
 */
export function listSystemPlaces(): SystemPlace[] {
  const places: SystemPlace[] = []
  const seen = new Set<string>()
  const home = homeDir()
  const platform = process.platform

  if (home) {
    pushPlace(places, seen, {
      id: 'home',
      path: home,
      name: path.basename(home) || 'Home',
      icon: 'mdi-home',
    })

    const desktop = userChild(home, 'Desktop', 'Рабочий стол')
    if (desktop) {
      pushPlace(places, seen, {id: 'desktop', path: desktop, name: 'Desktop', icon: 'mdi-monitor'})
    }

    const documents = userChild(home, 'Documents', 'Документы')
    if (documents) {
      pushPlace(places, seen, {id: 'documents', path: documents, name: 'Documents', icon: 'mdi-file-document'})
    }

    const downloads = userChild(home, 'Downloads', 'Загрузки')
    if (downloads) {
      pushPlace(places, seen, {id: 'downloads', path: downloads, name: 'Downloads', icon: 'mdi-download'})
    }

    const videos = platform === 'darwin'
      ? userChild(home, 'Movies', 'Videos', 'Видео')
      : userChild(home, 'Videos', 'Movies', 'Видео')
    if (videos) {
      pushPlace(places, seen, {id: 'videos', path: videos, name: 'Videos', icon: 'mdi-movie'})
    }

    const pictures = userChild(home, 'Pictures', 'Изображения', 'Картинки')
    if (pictures) {
      pushPlace(places, seen, {id: 'pictures', path: pictures, name: 'Pictures', icon: 'mdi-image'})
    }

    const music = userChild(home, 'Music', 'Музыка')
    if (music) {
      pushPlace(places, seen, {id: 'music', path: music, name: 'Music', icon: 'mdi-music'})
    }
  }

  if (platform === 'win32') {
    for (const drive of listWindowsDrivePlaces()) {
      pushPlace(places, seen, drive)
    }
  } else {
    pushPlace(places, seen, {
      id: 'computer',
      path: path.resolve('/'),
      name: 'Computer',
      icon: 'mdi-desktop-classic',
    })

    if (platform === 'darwin') {
      for (const volume of listUnixVolumePlaces('/Volumes', 'volume')) {
        pushPlace(places, seen, volume)
      }
      pushPlace(places, seen, {
        id: 'network',
        path: '/Network',
        name: 'Network',
        icon: 'mdi-folder-network',
      })
    } else {
      for (const volume of listLinuxUserMediaPlaces(home || '')) {
        pushPlace(places, seen, volume)
      }
      const uid = typeof process.getuid === 'function' ? process.getuid() : null
      if (uid != null) {
        pushPlace(places, seen, {
          id: 'network',
          path: path.join('/run/user', String(uid), 'gvfs'),
          name: 'Network',
          icon: 'mdi-folder-network',
        })
      }
    }
  }

  return places
}

/** Unique root paths used to confine browse navigation for local system places. */
export function listSystemPlaceRootPaths(): string[] {
  return [...new Set(listSystemPlaces().map((place) => path.resolve(place.path)))]
}
