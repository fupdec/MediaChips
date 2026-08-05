import fs from 'fs'
import path from 'path'
import {ipcMain, nativeImage, type IpcMainEvent, type NativeImage} from 'electron'
import {normalizeMediaPath} from '../api/utils/normalizeUserPath'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function ellipsizeDragTitle(title: string, maxWidthPx: number, fontSize: number): string {
  const text = String(title || 'Media').trim() || 'Media'
  // Approx advance for system UI semi-bold; keeps titles from overflowing the title bar.
  const avgAdvance = fontSize * 0.58
  const maxChars = Math.max(1, Math.floor(maxWidthPx / avgAdvance))
  if (text.length <= maxChars) return text
  if (maxChars <= 1) return '…'
  return `${text.slice(0, maxChars - 1)}…`
}

async function buildMediaDragCardIcon(options: {
  title?: string
  count?: number
  thumbPath?: string
}): Promise<NativeImage | null> {
  try {
    const sharp = (await import('sharp')).default
    const width = 75
    const height = 57
    const radius = 7
    const titleBar = 14
    const mediaH = height - titleBar
    const fontSize = 6.5
    const titlePad = 5
    const title = escapeXml(ellipsizeDragTitle(options.title || 'Media', width - titlePad * 2, fontSize))
    const count = Math.max(1, Math.floor(options.count || 1))
    // Render @2x so the smaller ghost stays sharp on Retina.
    const scale = 2

    let imageHref = ''
    const thumbPath = options.thumbPath ? normalizeMediaPath(options.thumbPath) : ''
    if (thumbPath && fs.existsSync(thumbPath)) {
      try {
        const thumbBuf = await sharp(thumbPath)
          .resize(width * scale, mediaH * scale, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
          .png({ compressionLevel: 6 })
          .toBuffer()
        imageHref = `data:image/png;base64,${thumbBuf.toString('base64')}`
      } catch {
        // keep empty image
      }
    }

    const stackOffset = 5
    const stack = count > 1
      ? `<rect x="${stackOffset}" y="${stackOffset}" width="${width}" height="${height}" rx="${radius}" fill="#a3a3ae" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`
      : ''
    const badgeW = String(count).length > 1 ? 16 : 13
    const badge = count > 1
      ? `<g transform="translate(${width - 1}, -2)">
           <rect x="0" y="0" width="${badgeW}" height="11" rx="5.5" fill="#3b82f6"/>
           <text x="${badgeW / 2}" y="8.2" text-anchor="middle" font-size="7" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fill="#fff">${count > 99 ? '99+' : count}</text>
         </g>`
      : ''

    const stackExtra = count > 1 ? stackOffset : 0
    const canvasW = width + stackExtra + 12
    const canvasH = height + stackExtra + 12
    const originX = 6
    const originY = count > 1 ? 8 : 6

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW * scale}" height="${canvasH * scale}" viewBox="0 0 ${canvasW} ${canvasH}">
  <g transform="translate(${originX}, ${originY})">
    ${stack}
    <defs>
      <clipPath id="card"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>
    </defs>
    <g clip-path="url(#card)">
      <rect width="${width}" height="${height}" fill="#1c1c1f"/>
      ${imageHref
        ? `<image href="${imageHref}" x="0" y="0" width="${width}" height="${mediaH}" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect width="${width}" height="${mediaH}" fill="#3f3f46"/>`}
      <rect y="${mediaH}" width="${width}" height="${titleBar}" fill="#25252a"/>
      <text x="${titlePad}" y="${mediaH + 9.5}" font-size="${fontSize}" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fill="rgba(255,255,255,0.92)">${title}</text>
    </g>
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.25"/>
    ${badge}
  </g>
</svg>`

    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const image = nativeImage.createFromBuffer(png)
    return image.isEmpty() ? null : image
  } catch (error) {
    console.warn('media-drag: sharp card icon failed:', error)
    return null
  }
}

async function resolveDragIcon(options: {
  iconDataUrl?: string
  thumbPath?: string
  title?: string
  count?: number
}): Promise<NativeImage> {
  const sharpIcon = await buildMediaDragCardIcon({
    title: options.title,
    count: options.count,
    thumbPath: options.thumbPath,
  })
  if (sharpIcon) return sharpIcon

  if (typeof options.iconDataUrl === 'string' && options.iconDataUrl.startsWith('data:image/')) {
    try {
      const fromDataUrl = nativeImage.createFromDataURL(options.iconDataUrl)
      if (!fromDataUrl.isEmpty()) return fromDataUrl
    } catch {
      // fall through
    }
  }

  if (typeof options.thumbPath === 'string' && options.thumbPath.length > 0) {
    try {
      const normalized = normalizeMediaPath(options.thumbPath)
      if (normalized && fs.existsSync(normalized)) {
        const thumb = nativeImage.createFromPath(normalized)
        if (!thumb.isEmpty()) {
          return thumb.resize({ width: 75, height: 57, quality: 'better' })
        }
      }
    } catch {
      // fall through
    }
  }

  const iconDir = path.join(__dirname, '..', 'dist/icons')
  const candidates = [
    path.join(iconDir, 'icon32x32.png'),
    path.join(iconDir, 'favicon-32x32.png'),
    path.join(iconDir, 'icon.png'),
  ]
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) return image
  }
  return nativeImage.createEmpty()
}

function parseMediaDragPaths(raw: unknown): string[] {
  if (typeof raw === 'string') return [raw]
  if (!raw || typeof raw !== 'object') return []
  const record = raw as { path?: unknown; paths?: unknown }
  if (Array.isArray(record.paths)) {
    return record.paths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  }
  if (typeof record.path === 'string' && record.path.length > 0) {
    return [record.path]
  }
  return []
}

function parseMediaDragStringField(raw: unknown, key: 'iconDataUrl' | 'thumbPath' | 'title'): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = (raw as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function parseMediaDragCount(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = (raw as { count?: unknown }).count
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}


export function registerMediaDragIpc(): void {
  ipcMain.on('media-drag:read-data-url', (event: IpcMainEvent, rawPath: unknown) => {
    try {
      if (typeof rawPath !== 'string' || !rawPath) {
        event.returnValue = null
        return
      }
      const normalized = normalizeMediaPath(rawPath)
      if (!normalized || !fs.existsSync(normalized)) {
        event.returnValue = null
        return
      }
      const stat = fs.statSync(normalized)
      if (!stat.isFile() || stat.size <= 0 || stat.size > 12 * 1024 * 1024) {
        event.returnValue = null
        return
      }
      const buf = fs.readFileSync(normalized)
      const ext = path.extname(normalized).toLowerCase()
      const mime = ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg'
      event.returnValue = `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      event.returnValue = null
    }
  })

  ipcMain.on('media-drag:start', (event: IpcMainEvent, raw: unknown) => {
    const existingPaths: string[] = []
    for (const rawPath of parseMediaDragPaths(raw)) {
      try {
        const normalized = normalizeMediaPath(rawPath)
        if (!normalized || !fs.existsSync(normalized)) continue
        const stat = fs.statSync(normalized)
        if (!stat.isFile()) continue
        existingPaths.push(normalized)
      } catch {
        // skip invalid paths
      }
    }

    if (existingPaths.length === 0) {
      if (typeof (event as IpcMainEvent & { returnValue?: unknown }).returnValue !== 'undefined') {
        event.returnValue = false
      }
      return
    }

    const sender = event.sender
    void resolveDragIcon({
      iconDataUrl: parseMediaDragStringField(raw, 'iconDataUrl'),
      thumbPath: parseMediaDragStringField(raw, 'thumbPath'),
      title: parseMediaDragStringField(raw, 'title'),
      count: parseMediaDragCount(raw) ?? existingPaths.length,
    }).then((icon) => {
      if (sender.isDestroyed()) return
      try {
        sender.startDrag({
          file: existingPaths[0],
          ...(existingPaths.length > 1 ? { files: existingPaths } : {}),
          icon,
        })
      } catch (error) {
        console.warn('media-drag:start failed:', error)
      }
    })

    // sendSync callers still get an ack; async send ignores returnValue.
    event.returnValue = true
  })
}
