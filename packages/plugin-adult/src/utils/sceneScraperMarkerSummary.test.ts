import { describe, expect, it } from 'vitest'
import {
  buildSceneScrapeSuccessNotificationText,
  formatSceneScrapeMarkerSummary,
} from './sceneScraperMarkerSummary'

describe('sceneScraperMarkerSummary', () => {
  const t = (key: string, params: Record<string, string | number> = {}) => {
    if (key === 'scene_scraper.markers_imported_summary') {
      return `Markers imported: ${params.count}`
    }
    if (key === 'scene_scraper.markers_none_on_tpdb') {
      return 'No markers on ThePornDB'
    }
    return key
  }

  it('formats marker summary when import is enabled', () => {
    expect(formatSceneScrapeMarkerSummary(3, true, t)).toBe('Markers imported: 3')
    expect(formatSceneScrapeMarkerSummary(0, true, t)).toBe('No markers on ThePornDB')
    expect(formatSceneScrapeMarkerSummary(0, false, t)).toBeNull()
  })

  it('builds success notification text with marker summary', () => {
    expect(buildSceneScrapeSuccessNotificationText({
      sceneTitle: 'Test Scene',
      markersImported: 2,
      importMarkersEnabled: true,
      t,
    })).toBe('Test Scene · Markers imported: 2')
  })
})
