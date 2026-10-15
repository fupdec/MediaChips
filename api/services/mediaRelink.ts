import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import path from 'node:path'
import {eq} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {media} from '../db/schema/media'
import {createMediaRepository} from '../db/repositories/media'
import {HttpError} from '../types/errors'
import {resolveExistingPath} from './contentHash'
import {computeOshashForPath} from './oshash'
import {parseMediaFilePath} from '../../shared/mediaPath'
import {remapMediaRoot, type MediaRelinkInput, type MediaRelinkCandidate} from '../../shared/mediaRelink'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {loadInheritedFolderTagsForMediaRows} from './mediaInheritedFolderTags'
import {tagsInMedia} from '../db/schema/tagsInMedia'

async function sha256(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

const pathKey = (value: string) => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export async function inspectMediaRelink(db: ApiDb, input: MediaRelinkInput): Promise<MediaRelinkCandidate> {
  const repo = createMediaRepository(db.drizzle)
  const existing = repo.findById(input.id)
  if (!existing || existing.deletedAt) throw new HttpError(404, 'Media not found')
  if (existing.path !== input.oldPath) throw new HttpError(409, 'Media path changed; refresh the preview')
  const result = (status: MediaRelinkCandidate['status']) => ({...input, status})
  const resolved = await resolveExistingPath(input.newPath)
  if (!resolved) return result('missing')
  const targetStat = await stat(resolved)
  if (!targetStat.isFile()) return result('missing')
  const owner = repo.findByPathVariants([input.newPath, resolved])
  if (owner && owner.id !== input.id) return result('conflict')
  if (Number(existing.filesize) > 0 && existing.filesize !== targetStat.size) return result('different')

  // A stored full hash wins over the sampled duplicate fingerprint.
  if (existing.contentHash && /^[a-f0-9]{64}$/i.test(existing.contentHash)) {
    return result(await sha256(resolved) === existing.contentHash.toLowerCase() ? 'same' : 'different')
  }
  const oldResolved = await resolveExistingPath(existing.path)
  if (oldResolved && pathKey(oldResolved) !== pathKey(resolved)) {
    if (!(await stat(oldResolved)).isFile()) return result('unknown')
    return result(await sha256(oldResolved) === await sha256(resolved) ? 'same' : 'different')
  }
  if (existing.oshash) {
    try {
      // Oshash samples the head and tail. Equal samples cannot prove that the
      // middle (and therefore time markers) still belongs to the same video.
      return result(await computeOshashForPath(resolved) === existing.oshash ? 'unknown' : 'different')
    } catch {
      return result('unknown')
    }
  }
  return result('unknown')
}

export async function previewMediaRootRelink(db: ApiDb, oldRoot: string, newRoot: string) {
  if (!oldRoot.trim() || !newRoot.trim()) throw new HttpError(400, 'Both root folders are required')
  const candidates: MediaRelinkCandidate[] = []
  for (const item of createMediaRepository(db.drizzle).findAllIdsAndPathsOrderedById()) {
    const newPath = remapMediaRoot(item.path, oldRoot, newRoot)
    if (newPath && newPath !== item.path) {
      const row = createMediaRepository(db.drizzle).findById(item.id)
      if (row?.deletedAt) continue
      candidates.push(await inspectMediaRelink(db, {id: item.id, oldPath: item.path, newPath}))
    }
  }
  return candidates
}

/** Recheck on commit. No writes until the entire selection has passed validation. */
export async function applyMediaRelinks(db: ApiDb, inputs: MediaRelinkInput[]) {
  const ids = new Set<number>()
  const paths = new Set<string>()
  const checked: Array<MediaRelinkCandidate & {contentHash: string}> = []
  for (const input of inputs) {
    if (!Number.isInteger(input.id) || input.id <= 0 || !input.oldPath || !input.newPath) {
      throw new HttpError(400, 'Invalid relink request')
    }
    const key = pathKey(input.newPath)
    if (ids.has(input.id) || paths.has(key)) throw new HttpError(409, 'Choose one file per media card')
    ids.add(input.id)
    paths.add(key)
    const candidate = await inspectMediaRelink(db, input)
    if (candidate.status !== 'same' && !(candidate.status === 'unknown' && input.confirmedOriginal === true)) {
      throw new HttpError(409, 'Original file identity must be confirmed; different content must be imported separately', {candidate})
    }
    const existingHash = createMediaRepository(db.drizzle).findById(input.id)?.contentHash
    const resolved = await resolveExistingPath(input.newPath)
    if (!resolved) throw new HttpError(409, 'Selected file disappeared; refresh the preview')
    // Establish a full baseline after the user confirms a legacy original.
    const contentHash = existingHash && /^[a-f0-9]{64}$/i.test(existingHash)
      ? existingHash
      : await sha256(resolved)
    checked.push({...candidate, contentHash})
  }
  const inheritedTags = await loadInheritedFolderTagsForMediaRows(db, checked.map((item) => ({id: item.id, path: item.oldPath})))
  db.sqlite.transaction(() => {
    for (const candidate of checked) {
      const current = createMediaRepository(db.drizzle).findById(candidate.id)
      if (current?.path !== candidate.oldPath) throw new HttpError(409, 'Media path changed; refresh the preview')
      const parsed = parseMediaFilePath(candidate.newPath)
      // Preserve card identity, custom title, chips, markers, and generated assets.
      db.drizzle.update(media).set({path: parsed.path, basename: parsed.basename, ext: parsed.ext, contentHash: candidate.contentHash})
        .where(eq(media.id, candidate.id)).run()
    }
    // Folder chips may only have been inherited at read time in older libraries.
    for (const tag of inheritedTags) db.drizzle.insert(tagsInMedia).values(tag).onConflictDoNothing().run()
  })()
  if (checked.length) invalidateMediaDerivedCaches()
  return {updated: checked.length}
}
