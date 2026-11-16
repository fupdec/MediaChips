import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import type {ApiDb} from '../../types/db'
import {HttpError} from '../../types/errors'
import {METADATA_EXTENSION, type MetadataBundle} from '../../../shared/metadataTransfer'
import {exportMetadata} from './service'

const xml = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[<>&"']/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[c]!))
export function metadataXml(bundle: MetadataBundle, format: 'xmp' | 'nfo'): string {
  const card = bundle.media[0]
  const tagIds = new Set(bundle.mediaTags.filter(r => r.mediaId === card.id).map(r => r.tagId))
  const keywords = bundle.tags.filter(r => tagIds.has(r.id)).map(r => r.name)
  const rating = typeof card.rating === 'number' && card.rating >= 0 && card.rating <= 5 ? card.rating : null
  const title = xml(card.name || card.basename)
  const payload = xml(JSON.stringify(bundle))
  if (format === 'nfo') return `<?xml version="1.0" encoding="UTF-8"?>\n<movie xmlns:mc="https://mediachips.app/ns/metadata/1.0/">\n<title>${title}</title>\n<uniqueid type="mediachips" default="true">${card.id}</uniqueid>\n${rating === null ? '' : `<userrating>${rating * 2}</userrating>\n`}${keywords.map(k => `<tag>${xml(k)}</tag>`).join('\n')}\n<playcount>${xml(card.views ?? 0)}</playcount>\n<mc:metadata>${payload}</mc:metadata>\n</movie>\n`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:mc="https://mediachips.app/ns/metadata/1.0/">\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>\n<dc:subject><rdf:Bag>${keywords.map(k => `<rdf:li>${xml(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>\n${rating === null ? '' : `<xmp:Rating>${rating}</xmp:Rating>\n`}${card.mediaCreatedAt ? `<xmp:CreateDate>${xml(card.mediaCreatedAt)}</xmp:CreateDate>\n` : ''}<mc:metadata>${payload}</mc:metadata>\n</rdf:Description></rdf:RDF></x:xmpmeta>\n`
}
export type SidecarFormat = 'json' | 'xmp' | 'nfo'
export function metadataSidecars(db: ApiDb, mediaIds: number[], formats: SidecarFormat[], token?: string) {
  const files: Array<{path: string; content: string; exists: boolean}> = []
  const seen = new Set<string>()
  for (const id of new Set(mediaIds)) {
    const bundle = exportMetadata(db, [id])
    // A stable timestamp lets a reviewed plan be verified on the write request.
    bundle.exportedAt = String(bundle.media[0].updatedAt)
    const original = String(bundle.media[0].path)
    if (!path.isAbsolute(original) || original.includes('://') || original.includes('!/') || !fs.statSync(original, {throwIfNoEntry: false})?.isFile()) throw new HttpError(400, 'Sidecars require an existing local original file')
    const stem = original.slice(0, original.length - path.extname(original).length)
    for (const format of new Set(formats)) {
      const target = format === 'json' ? original + METADATA_EXTENSION : `${stem}.${format}`
      if (target === original || seen.has(target)) throw new HttpError(409, `Sidecar paths collide: ${target}`)
      seen.add(target)
      files.push({path: target, content: format === 'json' ? JSON.stringify(bundle, null, 2) + '\n' : metadataXml(bundle, format), exists: fs.existsSync(target) || (() => { try { fs.lstatSync(target); return true } catch { return false } })()})
    }
  }
  const currentToken = createHash('sha256').update(JSON.stringify(files)).digest('hex')
  if (token !== undefined) {
    if (token !== currentToken) throw new HttpError(409, 'Sidecar plan changed. Preview again.')
    if (files.some(f => f.exists)) throw new HttpError(409, 'Sidecar files already exist')
    const created: string[] = []
    try {
      for (const file of files) {
        const fd = fs.openSync(file.path, 'wx')
        created.push(file.path)
        try { fs.writeFileSync(fd, file.content, 'utf8') } finally { fs.closeSync(fd) }
      }
    } catch (error) {
      for (const target of created) fs.rmSync(target, {force: true})
      throw error
    }
  }
  return {token: currentToken, files: files.map(({path, exists}) => ({path, exists})), written: token !== undefined}
}
