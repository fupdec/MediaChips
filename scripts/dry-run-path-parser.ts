#!/usr/bin/env node
/**
 * Dry-run path parser against a local MediaChips SQLite database.
 * Read-only: does not write anything to the database.
 *
 * Usage:
 *   node --experimental-strip-types scripts/dry-run-path-parser.ts
 *   node --experimental-strip-types scripts/dry-run-path-parser.ts --db /path/to/db.sqlite --limit 50
 */

import { execFileSync } from 'child_process'
import path from 'path'
import {
  buildTagPathIndex,
  matchPathToTagsFromPhrasesWithIndex,
  extractPathPhrases,
} from '../shared/pathParser/core.ts'

type RowTag = {
  id: number
  metaId: number
  name: string
  synonyms: string | null
}

type RowMedia = {
  id: number
  path: string
}

type Assignment = {
  mediaId: number
  tagId: number
  metaId: number
}

function parseArgs(argv: string[]) {
  const args = {
    db: path.join(process.cwd(), 'app_storage/19ef0593c17/db.sqlite'),
    limit: 0,
    sample: 15,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--db') args.db = argv[index + 1] || args.db
    if (value === '--limit') args.limit = Number(argv[index + 1] || 0)
    if (value === '--sample') args.sample = Number(argv[index + 1] || 15)
  }

  return args
}

function queryJson<T>(dbPath: string, sql: string): T[] {
  const output = execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  }).trim()

  if (!output) return []
  return JSON.parse(output) as T[]
}

function assignmentKey(item: Assignment) {
  return `${item.mediaId}:${item.metaId}:${item.tagId}`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const started = performance.now()

  const parserMetas = queryJson<{ id: number; name: string }>(
    args.db,
    'SELECT id, name FROM meta WHERE parser = 1 ORDER BY id',
  )

  const parserMetaIds = parserMetas.map((meta) => meta.id)
  if (!parserMetaIds.length) {
    console.log('No parser-enabled meta categories found.')
    return
  }

  const metaIdList = parserMetaIds.join(', ')
  const tags = queryJson<RowTag>(
    args.db,
    `SELECT id, metaId, name, synonyms FROM tags WHERE metaId IN (${metaIdList}) ORDER BY id`,
  )

  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const metaNameById = new Map(parserMetas.map((meta) => [meta.id, meta.name]))

  const media = queryJson<RowMedia>(
    args.db,
    args.limit > 0
      ? `SELECT id, path FROM media ORDER BY id LIMIT ${args.limit}`
      : 'SELECT id, path FROM media ORDER BY id',
  )

  const current = queryJson<Assignment>(
    args.db,
    `SELECT mediaId, tagId, metaId FROM tagsInMedia WHERE metaId IN (${metaIdList})`,
  )

  const matchOptions = { preferLongestMatch: true, minTokenLength: 2 }
  const index = buildTagPathIndex(tags, matchOptions)

  const proposedKeys = new Set<string>()

  for (const item of media) {
    const parsed = extractPathPhrases(item.path, matchOptions)
    const matches = matchPathToTagsFromPhrasesWithIndex(parsed, item.id, index, matchOptions)

    for (const match of matches) {
      proposedKeys.add(assignmentKey({
        mediaId: Number(match.mediaId),
        tagId: Number(match.tagId),
        metaId: Number(match.metaId),
      }))
    }
  }

  const currentKeys = new Set(current.map(assignmentKey))
  const addedKeys = [...proposedKeys].filter((key) => !currentKeys.has(key))
  const removedKeys = [...currentKeys].filter((key) => !proposedKeys.has(key))
  const unchangedCount = [...proposedKeys].filter((key) => currentKeys.has(key)).length

  const mediaById = new Map(media.map((row) => [row.id, row]))

  const describeAssignment = (key: string) => {
    const [mediaId, metaId, tagId] = key.split(':').map(Number)
    const mediaRow = mediaById.get(mediaId)
    const tag = tagById.get(tagId)
    return {
      mediaId,
      path: mediaRow?.path || '(path outside sample)',
      meta: metaNameById.get(metaId) || String(metaId),
      tag: tag?.name || String(tagId),
    }
  }

  const changedMediaIds = new Set<number>()
  for (const key of [...addedKeys, ...removedKeys]) {
    changedMediaIds.add(Number(key.split(':')[0]))
  }

  console.log(JSON.stringify({
    summary: {
      database: args.db,
      parserMetas: parserMetas.map((meta) => `${meta.name} (#${meta.id})`),
      mediaScanned: media.length,
      parserTags: tags.length,
      currentAssignments: current.length,
      proposedAssignments: proposedKeys.size,
      unchanged: unchangedCount,
      wouldAdd: addedKeys.length,
      wouldRemove: removedKeys.length,
      mediaWithChanges: changedMediaIds.size,
      elapsedMs: Number((performance.now() - started).toFixed(1)),
    },
    examples: {
      added: addedKeys.slice(0, args.sample).map(describeAssignment),
      removed: removedKeys.slice(0, args.sample).map(describeAssignment),
    },
  }, null, 2))
}

main()
