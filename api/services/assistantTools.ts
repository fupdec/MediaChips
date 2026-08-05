import type {ApiDb} from '../types/db'
import {createMediaRepository} from '../db/repositories/media'
import {createMetaRepository} from '../db/repositories/meta'
import {createTagsRepository} from '../db/repositories/tags'
import {searchDocs} from './docRetrieval'
import {
  clampAssistantToolLimit,
  filterMediaRowsByQuery,
  filterTagRowsByQuery,
  projectMetaRowsForAssistant,
  resolveAssistantToolQuery,
} from './assistantToolQueries'

export type AssistantToolName = 'search_docs' | 'search_media' | 'list_meta' | 'list_tags'

export type AssistantToolDef = {
  name: AssistantToolName
  description: string
  needsConfirmation: boolean
}

export const ASSISTANT_TOOLS: AssistantToolDef[] = [
  {
    name: 'search_docs',
    description: 'Search built-in MediaChips documentation',
    needsConfirmation: false,
  },
  {
    name: 'search_media',
    description: 'Search media items by name/path substring',
    needsConfirmation: false,
  },
  {
    name: 'list_meta',
    description: 'List metadata categories (chips)',
    needsConfirmation: false,
  },
  {
    name: 'list_tags',
    description: 'List tags, optionally filtered by name',
    needsConfirmation: false,
  },
]

export type AssistantToolCall = {
  id: string
  name: AssistantToolName
  arguments: Record<string, unknown>
}

export async function executeAssistantTool(
  db: ApiDb,
  call: AssistantToolCall,
  options: {locale?: string} = {},
): Promise<{ok: boolean; result: unknown; needsConfirmation?: boolean}> {
  const name = call.name
  const args = call.arguments || {}

  if (name === 'search_docs') {
    const query = resolveAssistantToolQuery(args)
    const chunks = searchDocs(
      query,
      String(options.locale || 'en'),
      clampAssistantToolLimit(args.limit, {max: 20, fallback: 5}),
    )
    return {ok: true, result: {chunks}}
  }

  if (name === 'search_media') {
    const query = resolveAssistantToolQuery(args)
    const mediaRepo = createMediaRepository(db.drizzle)
    const all = mediaRepo.findAllRaw()
    const limit = clampAssistantToolLimit(args.limit, {max: 20, fallback: 10})
    const matches = filterMediaRowsByQuery(all, query, limit).map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
    }))
    return {ok: true, result: {items: matches, count: matches.length}}
  }

  if (name === 'list_meta') {
    const metaRepo = createMetaRepository(db.drizzle)
    const rows = metaRepo.findAll()
    return {
      ok: true,
      result: {
        items: projectMetaRowsForAssistant(rows),
      },
    }
  }

  if (name === 'list_tags') {
    const query = resolveAssistantToolQuery(args)
    const tagRepo = createTagsRepository(db.drizzle, db.sqlite)
    const rows = tagRepo.findAllRaw()
    const limit = clampAssistantToolLimit(args.limit, {max: 50, fallback: 20})
    const items = filterTagRowsByQuery(rows, query, limit).map((row) => ({
      id: row.id,
      name: row.name,
      metaId: row.metaId,
    }))
    return {ok: true, result: {items, count: items.length}}
  }

  return {ok: false, result: {message: `Unknown tool: ${name}`}}
}
