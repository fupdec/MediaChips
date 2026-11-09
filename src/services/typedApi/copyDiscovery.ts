import {apiClient} from '../apiClient'
import type {CopyDiscoveryInput, CopyDiscoveryJob} from '@shared/copyDiscovery'
const base = '/api/copy-discovery/jobs'
export const copyDiscoveryApi = {
  activity: (signal?: AbortSignal) => apiClient.get<Pick<CopyDiscoveryJob, 'id' | 'state'>[]>('/api/copy-discovery/activity', {signal}),
  pause: (id: string) => apiClient.post<CopyDiscoveryJob>(`${base}/${id}/pause`),
  resume: (id: string) => apiClient.post<CopyDiscoveryJob>(`${base}/${id}/resume`),
  list: () => apiClient.get<CopyDiscoveryJob[]>(base),
  clearHistory: () => apiClient.delete<CopyDiscoveryJob[]>(`${base}/history`),
  create: (input: CopyDiscoveryInput) => apiClient.post<CopyDiscoveryJob>(base, input),
  job: (id: string) => apiClient.get<CopyDiscoveryJob>(`${base}/${id}`),
  cancel: (id: string) => apiClient.post<CopyDiscoveryJob>(`${base}/${id}/cancel`),
  retry: (id: string) => apiClient.post<CopyDiscoveryJob>(`${base}/${id}/retry`),
  choose: (id: string, itemId: string, mediaId: number) => apiClient.post<CopyDiscoveryJob>(`${base}/${id}/items/${itemId}/choose`, {mediaId}),
  undo: (id: string, itemId: string) => apiClient.post<CopyDiscoveryJob>(`${base}/${id}/items/${itemId}/undo`),
}
