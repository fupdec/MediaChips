import type { DrizzleClient } from '../db/client'
import type Database from 'better-sqlite3'

export type AnyRecord = Record<string, unknown>

export interface ApiDb {
  path?: string
  path_databases?: string
  config?: {
    id?: string
    name?: string
    active?: boolean
  }
  drizzle: DrizzleClient
  sqlite: Database.Database
}

export type MediaLike = AnyRecord & {
  id?: number | string
  path?: string
  name?: string
  basename?: string
  ext?: string
  mediaTypeId?: number | string
  filesize?: number
  contentHash?: string | null
  oshash?: string | null
}

export type FilterLike = AnyRecord & {
  type?: string
  param?: string | number
  cond?: string
  val?: unknown
  active?: boolean | number | string
}

export type TagLike = AnyRecord & {
  id?: number | string
  name?: string
  metaId?: number | string
}

export type MetaLike = AnyRecord & {
  id?: number | string
  name?: string
  type?: string
}
