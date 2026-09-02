import router from '@/router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { typedApi } from '@/services/typedApi'
import { ensureStarterMeta } from '@/services/ensureStarterMeta'
import { getDefaultMediaTypeId, isManagedMediaType } from '@/utils/mediaType'
import { setOption } from '@/services/settingsService'

/** Returns true when the active database has no media rows. */
export async function isLibraryEmpty(): Promise<boolean> {
  try {
    const {data} = await typedApi.getHomeExtendedStats()
    return Number(data?.total || 0) === 0
  } catch (error) {
    console.error('Failed to check empty library:', error)
    return false
  }
}

/** Ensure starter Tags exist for the current (possibly new) empty database. */
export async function ensureSilentStarterMetaForEmptyLibrary(): Promise<void> {
  const app = useAppStore()
  const settings = useSettingsStore()
  const mediaTypeIds = (app.mediaTypes || [])
    .filter(isManagedMediaType)
    .map((mediaType) => Number(mediaType.id))
    .filter((id) => id > 0)

  if (!mediaTypeIds.length) return

  try {
    await ensureStarterMeta({mediaTypeIds})
    if (settings.ratingAndFavoriteInCard !== '1') {
      settings.updateState({key: 'ratingAndFavoriteInCard', value: '1'})
      await setOption('1', 'ratingAndFavoriteInCard')
    }
  } catch (error) {
    console.error('Failed to ensure starter meta for empty library:', error)
  }
}

/** Redirect Home → /media when the current DB has no media. */
export async function navigateToLibraryIfEmpty(): Promise<void> {
  if (!(await isLibraryEmpty())) return

  await ensureSilentStarterMetaForEmptyLibrary()

  const app = useAppStore()
  const mediaTypeId = getDefaultMediaTypeId(app.mediaTypes)
  const route = router.currentRoute.value

  if (route.path === '/media' || route.path === '/meta') return

  if (mediaTypeId) {
    await router.replace({path: '/media', query: {mediaTypeId: String(mediaTypeId)}})
  } else {
    await router.replace({path: '/media'})
  }
}

/**
 * After app ready / DB switch: empty libraries land on media with starter meta.
 * Non-empty libraries keep the caller’s navigation (usually Home).
 */
export async function landEmptyLibraryAfterReady(): Promise<void> {
  if (!(await isLibraryEmpty())) return
  await navigateToLibraryIfEmpty()
}
