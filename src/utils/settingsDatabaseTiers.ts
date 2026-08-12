/**
 * Database Settings tiers: hide jargon behind Essential / Search & AI / Experts.
 * Deep-links to expert tools should auto-expand the Experts disclosure.
 */

export const DATABASE_ESSENTIAL_SECTIONS = [
  'library_health_guide',
] as const

export const DATABASE_SEARCH_AI_SECTIONS = [
  'clip_embedding_backfill',
  'detect_faces',
  'tag_image_ai_upscale',
] as const

export const DATABASE_EXPERTS_SECTIONS = [
  'generate_video_images',
  'generate_image_thumbs',
  'generate_auto_chapters',
  'video_codec_backfill',
  'media_created_backfill',
  'oshash_backfill',
  'fingerprint_backfill',
  'visual_hash_backfill',
  'content_hash_backfill',
  'find_missing',
  'find_duplicates',
  'clear_generated',
] as const

const EXPERTS_SET = new Set<string>(DATABASE_EXPERTS_SECTIONS)
const SEARCH_AI_SET = new Set<string>(DATABASE_SEARCH_AI_SECTIONS)

export function isDatabaseExpertsSection(section: string): boolean {
  return EXPERTS_SET.has(String(section || ''))
}

export function isDatabaseSearchAiSection(section: string): boolean {
  return SEARCH_AI_SET.has(String(section || ''))
}

export type DatabaseSettingsTier = 'essential' | 'search_ai' | 'experts' | 'storage' | null

export function resolveDatabaseSettingsTier(section: string): DatabaseSettingsTier {
  const key = String(section || '')
  if (!key) return null
  if (key === 'databases' || key === 'database_add' || key === 'open_data_folder' || key === 'backups') {
    return 'storage'
  }
  if ((DATABASE_ESSENTIAL_SECTIONS as readonly string[]).includes(key)) return 'essential'
  if (isDatabaseSearchAiSection(key)) return 'search_ai'
  if (isDatabaseExpertsSection(key)) return 'experts'
  return null
}
