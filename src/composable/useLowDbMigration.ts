import { typedApi } from '@/services/typedApi'
import { useOperationsStore } from '@/stores/operations'

export async function openLowDbMigrationIfNeeded(isPlayerWindow: boolean): Promise<boolean> {
  if (isPlayerWindow) return false

  try {
    await typedApi.checkDataForMigrateFromLowDb()
    useOperationsStore().migrationLowDb.dialog = true
    return true
  } catch {
    return false
  }
}
