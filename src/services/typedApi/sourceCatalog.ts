import {apiClient} from '../apiClient'
import type {CatalogRoot, CatalogRootInput, SourceJob, OfflineStatus} from '@shared/sourceCatalog'
const base = '/api/source-catalog'
export const sourceCatalogApi = {
  roots: () => apiClient.get<CatalogRoot[]>(`${base}/roots`),
  saveRoot: (input: CatalogRootInput) => apiClient.post<CatalogRoot>(`${base}/roots`, input),
  refresh: (id: string) => apiClient.post<SourceJob>(`${base}/roots/${id}/refresh`),
  jobs: () => apiClient.get<SourceJob[]>(`${base}/jobs`),
  job: (id: string) => apiClient.get<SourceJob>(`${base}/jobs/${id}`),
  cancel: (id: string) => apiClient.post(`${base}/jobs/${id}/cancel`),
  cache: () => apiClient.get<{usedBytes: number; limitBytes: number}>(`${base}/cache`),
  setLimit: (limitBytes: number) => apiClient.put(`${base}/cache`, {limitBytes}),
  offline: (id: number) => apiClient.get<OfflineStatus>(`${base}/media/${id}/offline`),
  saveOffline: (id: number) => apiClient.post<SourceJob>(`${base}/media/${id}/offline`),
  removeOffline: (id: number) => apiClient.delete(`${base}/media/${id}/offline`),
}
