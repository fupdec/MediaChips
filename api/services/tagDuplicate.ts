import fs from 'fs'
import path from 'path'
import {eq, or} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {createTagsRepository, type TagRow} from '../db/repositories/tags'
import {createValuesInTagRepository} from '../db/repositories/valuesInTag'
import {createTagsInTagRepository} from '../db/repositories/tagsInTag'
import {valuesInTags} from '../db/schema/valuesInTag'
import {tagsInTags} from '../db/schema/tagsInTag'
import {allocateCopyName} from './copyName'
import {findTagIdByNormalizedName} from './tagNameUniqueness'

export interface DuplicateTagInput {
  id: number
  name?: string | null
}

export interface DuplicateTagResult {
  tag: TagRow
  copied: {
    values: number
    nestedLinks: number
    images: number
  }
}

function copyTagImages(dbPath: string, metaId: number, sourceTagId: number, newTagId: number): number {
  const metaDir = path.join(dbPath, 'meta', String(metaId))
  if (!fs.existsSync(metaDir)) return 0

  const prefix = `${sourceTagId}_`
  const files = fs.readdirSync(metaDir)
  let copied = 0

  for (const file of files) {
    if (!file.startsWith(prefix)) continue
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue

    const suffix = file.slice(prefix.length)
    const destName = `${newTagId}_${suffix}`
    const srcPath = path.join(metaDir, file)
    const destPath = path.join(metaDir, destName)
    try {
      fs.copyFileSync(srcPath, destPath)
      copied += 1
    } catch {
      // Skip unreadable/unwritable assets; tag row still succeeds.
    }
  }

  return copied
}

export function duplicateTag(
  db: ApiDb,
  input: DuplicateTagInput,
): DuplicateTagResult {
  const sourceId = Number(input.id)
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    throw new HttpError(400, 'Tag id is required')
  }

  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const valuesRepo = createValuesInTagRepository(db.drizzle)
  const tagsInTagRepo = createTagsInTagRepository(db.drizzle)

  const source = tagsRepo.findById(sourceId)
  if (!source) {
    throw new HttpError(404, 'Tag not found')
  }

  const metaId = Number(source.metaId)
  if (!Number.isFinite(metaId) || metaId <= 0) {
    throw new HttpError(400, 'Tag category is required')
  }

  const isNameTaken = (candidate: string) => findTagIdByNormalizedName(db.sqlite, candidate) != null

  const requestedName = typeof input.name === 'string' ? input.name.trim() : ''
  const name = requestedName
    ? (isNameTaken(requestedName) ? allocateCopyName(requestedName, isNameTaken) : requestedName)
    : allocateCopyName(String(source.name || ''), isNameTaken, 'Tag')

  const [created] = tagsRepo.bulkCreate([{
    name,
    metaId,
    synonyms: source.synonyms ?? null,
    rating: source.rating ?? 0,
    favorite: source.favorite ?? false,
    bookmark: source.bookmark ?? null,
    country: source.country ?? null,
    color: source.color ?? null,
    views: 0,
  }])

  if (!created) {
    throw new HttpError(500, 'Failed to create duplicated tag')
  }

  const values = db.drizzle.select()
    .from(valuesInTags)
    .where(eq(valuesInTags.tagId, sourceId))
    .all()
  if (values.length) {
    valuesRepo.bulkCreate(values.map((row) => ({
      tagId: created.id,
      metaId: Number(row.metaId),
      value: row.value ?? null,
    })))
  }

  const nestedLinks = db.drizzle.select()
    .from(tagsInTags)
    .where(or(
      eq(tagsInTags.parentTagId, sourceId),
      eq(tagsInTags.tagId, sourceId),
    ))
    .all()

  const remappedLinks = nestedLinks
    .map((link) => {
      const parentTagId = Number(link.parentTagId) === sourceId ? created.id : Number(link.parentTagId)
      const tagId = Number(link.tagId) === sourceId ? created.id : Number(link.tagId)
      if (parentTagId === tagId) return null
      return {
        parentTagId,
        tagId,
        metaId: Number(link.metaId),
      }
    })
    .filter((link): link is {parentTagId: number; tagId: number; metaId: number} => link != null)

  if (remappedLinks.length) {
    tagsInTagRepo.bulkCreate(remappedLinks)
  }

  const images = db.path
    ? copyTagImages(db.path, metaId, sourceId, created.id)
    : 0

  return {
    tag: created,
    copied: {
      values: values.length,
      nestedLinks: remappedLinks.length,
      images,
    },
  }
}
