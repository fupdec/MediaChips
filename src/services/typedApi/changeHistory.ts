import {apiClient} from '../apiClient'
import type {HistoryEntity, HistoryField, HistoryOperation, HistoryPage} from '@shared/changeHistory'

export const changeHistoryApi = {
  getChangeHistory(params: {limit?: number; offset?: number; entityType?: HistoryEntity; entityId?: number} = {}) {
    return apiClient.get<HistoryPage<HistoryOperation>>('/api/change-history', {params})
  },
  getChangeHistoryDetails(operationId: string, offset = 0) {
    return apiClient.get<HistoryPage<HistoryField>>(`/api/change-history/${encodeURIComponent(operationId)}`, {params: {offset, limit: 100}})
  },
  restoreChangeHistory(operationId: string, fieldId?: number) {
    return apiClient.post<{restored: number}>(`/api/change-history/${encodeURIComponent(operationId)}/restore`, {fieldId})
  },
}
