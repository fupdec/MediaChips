export function formatSceneScrapeMarkerSummary(
  markersImported: number | undefined,
  importEnabled: boolean,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (!importEnabled) return null

  const count = markersImported ?? 0
  if (count > 0) {
    return t('scene_scraper.markers_imported_summary', { count })
  }

  return t('scene_scraper.markers_none_on_tpdb')
}

export function buildSceneScrapeSuccessNotificationText({
  sceneTitle,
  mediaName,
  markersImported,
  importMarkersEnabled,
  t,
}: {
  sceneTitle?: string | null
  mediaName?: string | null
  markersImported?: number
  importMarkersEnabled: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}): string {
  const parts: string[] = []
  const title = sceneTitle || mediaName
  if (title) parts.push(title)

  const markerSummary = formatSceneScrapeMarkerSummary(
    markersImported,
    importMarkersEnabled,
    t,
  )
  if (markerSummary) parts.push(markerSummary)

  return parts.join(' · ')
}
