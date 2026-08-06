import { clearDynamicPlaylistsSummaryCache } from './dynamicPlaylistsSummaryCache'
import { clearInheritedFolderTagsCache } from './mediaInheritedFolderTags'
import { clearMediaListGroupingCache } from './mediaListGroupingCache'
import { clearMediaListTotalsCache } from './mediaListTotalsCache'
import { terminateFilterItemsWorker } from './filterItemsWorkerRunner'

export function invalidateMediaDerivedCaches(): void {
  clearMediaListTotalsCache()
  clearMediaListGroupingCache()
  clearDynamicPlaylistsSummaryCache()
  clearInheritedFolderTagsCache()
  terminateFilterItemsWorker()
}
