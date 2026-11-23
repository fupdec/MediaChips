import { clearDynamicPlaylistsSummaryCache } from './dynamicPlaylistsSummaryCache'
import { clearInheritedFolderTagsCache } from './mediaInheritedFolderTags'
import { clearMediaListGroupingCache } from './mediaListGroupingCache'
import { clearMediaListTotalsCache } from './mediaListTotalsCache'
import { clearHomeNavCountsCache } from './homeNavCounts'
import { clearHomeSimilarCache } from './homeSimilar'
import { terminateFilterItemsWorker } from './filterItemsWorkerRunner'

export function invalidateMediaDerivedCaches(): void {
  clearMediaListTotalsCache()
  clearMediaListGroupingCache()
  clearDynamicPlaylistsSummaryCache()
  clearInheritedFolderTagsCache()
  clearHomeNavCountsCache()
  clearHomeSimilarCache()
  terminateFilterItemsWorker()
}
