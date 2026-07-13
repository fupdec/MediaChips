import type { Meta } from '@/types/stores'

export interface ScraperPerformer {
  slug?: string
  posters?: unknown[]
  [key: string]: unknown
}

export interface ScraperPerformerSearchResponse {
  data?: ScraperPerformer[]
  [key: string]: unknown
}

export interface ScraperPoster {
  id: string | number
  url: string
  size: number
}

export interface ScraperSelectedResult {
  name?: string | null
  aliases?: string[]
  extras?: Record<string, unknown>
  posters?: ScraperPoster[]
}

export interface ScraperPinnedItem {
  scraper?: string
  pinnedMetaId?: number
  metaId?: number
  meta?: Meta
  [key: string]: unknown
}

export interface ScraperTransferField {
  dataType?: string
  valueCurrent: unknown
  valueReserved: unknown
  valueScraper?: unknown
  isTagExists?: boolean
  scrapedTags?: import('@/utils/sceneScraperTags').SceneScraperTagEntry[]
  key: string
  meta: Meta
  isTransfered: boolean
  isAlreadyContain?: boolean
}

export interface ScraperMultiplePerformer {
  performer: { id: number | string; name?: string }
  result: ScraperSelectedResult
  status?: 'pending' | 'searching' | 'applying' | 'done' | 'error' | 'not_found'
  error?: string
  tagName?: string
  matchedName?: string
}
