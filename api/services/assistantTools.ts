import type {ApiDb} from '../types/db'
import {createMediaRepository} from '../db/repositories/media'
import {createMetaRepository} from '../db/repositories/meta'
import {createTagsRepository} from '../db/repositories/tags'
import {searchDocs} from './docRetrieval'

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
    const query = String(args.query || args.q || '')
    const chunks = searchDocs(query, String(options.locale || 'en'), Number(args.limit) || 5)
    return {ok: true, result: {chunks}}
  }

  if (name === 'search_media') {
    const query = String(args.query || args.q || '').trim().toLowerCase()
    const mediaRepo = createMediaRepository(db.drizzle)
    const all = mediaRepo.findAllRaw()
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 10))
    const matches = all
      .filter((row) => {
        if (!query) return false
        const hay = `${row.name || ''} ${row.path || ''}`.toLowerCase()
        return hay.includes(query)
      })
      .slice(0, limit)
      .map((row) => ({
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
        items: rows.slice(0, 100).map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
        })),
      },
    }
  }

  if (name === 'list_tags') {
    const query = String(args.query || args.q || '').trim().toLowerCase()
    const tagRepo = createTagsRepository(db.drizzle, db.sqlite)
    const rows = tagRepo.findAllRaw()
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
    const items = rows
      .filter((row) => !query || String(row.name || '').toLowerCase().includes(query))
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        name: row.name,
        metaId: row.metaId,
      }))
    return {ok: true, result: {items, count: items.length}}
  }

  return {ok: false, result: {message: `Unknown tool: ${name}`}}
}
