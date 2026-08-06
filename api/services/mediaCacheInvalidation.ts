import { clearDynamicPlaylistsSummaryCache } from './dynamicPlaylistsSummaryCache'
import { clearMediaListGroupingCache } from './mediaListGroupingCache'
import { clearMediaListTotalsCache } from './mediaListTotalsCache'
import { terminateFilterItemsWorker } from './filterItemsWorkerRunner'

export function invalidateMediaDerivedCaches(): void {
  clearMediaListTotalsCache()
  clearMediaListGroupingCache()
  clearDynamicPlaylistsSummaryCache()
  terminateFilterItemsWorker()
}
