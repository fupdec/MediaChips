import {apiClient} from '../apiClient'
import type {OriginalJob, OriginalOperation, OriginalTarget} from '@shared/originalOperations'
const base = '/api/original-operations'
export type OriginalSourceInfo = {provider: 'local' | 'nas' | 'gdrive'; path: string; name: string; ext?: string | null; parentKey?: string; source: OriginalTarget; writable: boolean}
export const originalOperationsApi = {
  source: (id: number) => apiClient.get<OriginalSourceInfo>(`${base}/media/${id}`),
  jobs: () => apiClient.get<OriginalJob[]>(`${base}/jobs`),
  job: (id: string) => apiClient.get<OriginalJob>(`${base}/jobs/${id}`),
  create: (items: OriginalOperation[]) => apiClient.post<OriginalJob>(`${base}/jobs`, {items}),
  retry: (id: string, conflict: OriginalOperation['conflict']) => apiClient.post<OriginalJob>(`${base}/jobs/${id}/retry`, {conflict}),
  cancel: (id: string) => apiClient.post(`${base}/jobs/${id}/cancel`),
  upload: (id: string, itemId: string, file: File) => apiClient.put<OriginalJob>(`${base}/jobs/${id}/uploads/${itemId}`, file, {headers: {'Content-Type': 'application/octet-stream'}}),
}
