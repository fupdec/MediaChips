import {apiClient, buildApiUrl} from '../apiClient'
import {getAuthToken} from '../authSession'
import type {MediaCopies} from '@shared/mediaCopies'
const base = (id: number) => `/api/Media/${id}/copies`
export const mediaCopiesApi = {
  list: (id: number) => apiClient.get<MediaCopies>(base(id)),
  prefer: (id: number, copyId: string | null) => apiClient.put<MediaCopies>(`${base(id)}/preferred`, {copyId}),
  attachLocal: (id: number, path: string) => apiClient.post<MediaCopies>(`${base(id)}/local`, {path}, {timeout: 30 * 60_000}),
  detach: (id: number, copyId: string) => apiClient.delete<MediaCopies>(`${base(id)}/${encodeURIComponent(copyId)}`),
}
export function mediaCopyStreamUrl(id: number) {
  const token = getAuthToken()
  return buildApiUrl(`${base(id)}/stream`) + (token ? `?token=${encodeURIComponent(token)}` : '')
}
