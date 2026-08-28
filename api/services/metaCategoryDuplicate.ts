import fs from 'fs'
import path from 'path'
import {eq} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {createMetaRepository, type MetaRow} from '../db/repositories/meta'
import {createMetaInMediaTypesRepository} from '../db/repositories/metaInMediaTypes'
import {createPinnedMetaRepository} from '../db/repositories/pinnedMeta'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {allocateCopyName} from './copyName'

export interface DuplicateCategoryInput {
  id: number
  name?: string | null
}

export interface DuplicateCategoryResult {
  meta: MetaRow
  copied: {
    mediaTypeAssignments: number
    pinnedFields: number
  }
}

function normalizeMetaName(name: string): string {
  return String(name || '').trim().toLowerCase()
}

function buildCategoryPayload(source: MetaRow, name: string): Record<string, unknown> {
  return {
    type: source.type,
    name,
    icon: source.icon,
    hint: source.hint,
    order: source.order,
    synonyms: source.synonyms,
    hidden: source.hidden,
    nested: source.nested,
    marks: source.marks,
    bookmark: source.bookmark,
    parser: source.parser,
    pathRegex: source.pathRegex,
    pathRegexReplace: source.pathRegexReplace,
    pathRegexCreateTags: source.pathRegexCreateTags,
    pathRegexEnabled: source.pathRegexEnabled,
    country: source.country,
    career: source.career,
    scraper: source.scraper,
    rating: source.rating,
    favorite: source.favorite,
    chipVariant: source.chipVariant,
    chipLabel: source.chipLabel,
    color: source.color,
    autoColorFromImage: source.autoColorFromImage,
    imageAspectRatio: source.imageAspectRatio,
    tagPageDesign: source.tagPageDesign,
    measurementUnit: source.measurementUnit,
    isLink: source.isLink,
    ratingIcon: source.ratingIcon,
    ratingIconEmpty: source.ratingIconEmpty,
    ratingIconHalf: source.ratingIconHalf,
    ratingMax: source.ratingMax,
    ratingColor: source.ratingColor,
    ratingHalf: source.ratingHalf,
    sortBy: source.sortBy,
    sortDir: source.sortDir,
    parentMetaId: source.parentMetaId,
  }
}

export function duplicateTagCategory(
  db: ApiDb,
  input: DuplicateCategoryInput,
): DuplicateCategoryResult {
  const sourceId = Number(input.id)
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    throw new HttpError(400, 'Category id is required')
  }

  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const pinnedMetaRepo = createPinnedMetaRepository(db.drizzle)

  const source = metaRepo.findById(sourceId)
  if (!source) {
    throw new HttpError(404, 'Tag category not found')
  }
  if (source.type !== 'array') {
    throw new HttpError(400, 'Only tag categories can be duplicated')
  }

  const arrayNames = new Set(
    db.drizzle.select({name: meta.name, type: meta.type})
      .from(meta)
      .all()
      .filter((row) => row.type === 'array')
      .map((row) => normalizeMetaName(String(row.name || ''))),
  )

  const requestedName = typeof input.name === 'string' ? input.name.trim() : ''
  const name = requestedName
    ? (
      arrayNames.has(normalizeMetaName(requestedName))
        ? allocateCopyName(requestedName, (candidate) => arrayNames.has(normalizeMetaName(candidate)))
        : requestedName
    )
    : allocateCopyName(
      String(source.name || ''),
      (candidate) => arrayNames.has(normalizeMetaName(candidate)),
      'Tags',
    )

  const created = metaRepo.create(buildCategoryPayload(source, name))

  const metaFolder = path.join(db.path ?? '', 'meta', String(created.id))
  if (!fs.existsSync(metaFolder)) {
    fs.mkdirSync(metaFolder, {recursive: true})
  }
  metaRepo.ensureArrayMetaResources(created.id)

  const mediaAssignments = db.drizzle.select()
    .from(metaInMediaTypes)
    .where(eq(metaInMediaTypes.metaId, sourceId))
    .all()
  for (const assignment of mediaAssignments) {
    metaInMediaTypesRepo.create({
      metaId: created.id,
      mediaTypeId: Number(assignment.mediaTypeId),
      scraper: assignment.scraper ?? null,
      show: assignment.show ?? true,
      order: assignment.order ?? null,
    })
  }

  const pinnedFields = pinnedMetaRepo.findAll({metaId: sourceId})
  for (const pin of pinnedFields) {
    // Do not pin the new category onto itself if source somehow pinned self.
    if (Number(pin.pinnedMetaId) === sourceId) continue
    pinnedMetaRepo.create({
      metaId: created.id,
      pinnedMetaId: Number(pin.pinnedMetaId),
      scraper: pin.scraper ?? null,
      show: pin.show ?? true,
      order: pin.order ?? null,
    })
  }

  return {
    meta: created,
    copied: {
      mediaTypeAssignments: mediaAssignments.length,
      pinnedFields: pinnedFields.filter((pin) => Number(pin.pinnedMetaId) !== sourceId).length,
    },
  }
}
