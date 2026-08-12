import {describe, expect, it} from 'vitest'
import {
  isDatabaseExpertsSection,
  isDatabaseSearchAiSection,
  resolveDatabaseSettingsTier,
} from './settingsDatabaseTiers'

describe('settingsDatabaseTiers', () => {
  it('classifies essential, search/ai, and experts sections', () => {
    expect(resolveDatabaseSettingsTier('library_health_guide')).toBe('essential')
    expect(resolveDatabaseSettingsTier('clip_embedding_backfill')).toBe('search_ai')
    expect(resolveDatabaseSettingsTier('detect_faces')).toBe('search_ai')
    expect(resolveDatabaseSettingsTier('fingerprint_backfill')).toBe('experts')
    expect(resolveDatabaseSettingsTier('generate_video_images')).toBe('experts')
    expect(resolveDatabaseSettingsTier('databases')).toBe('storage')
  })

  it('exposes helpers for deep-link expand', () => {
    expect(isDatabaseExpertsSection('clear_generated')).toBe(true)
    expect(isDatabaseExpertsSection('library_health_guide')).toBe(false)
    expect(isDatabaseSearchAiSection('tag_image_ai_upscale')).toBe(true)
    expect(isDatabaseSearchAiSection('find_missing')).toBe(false)
  })
})
