import {apiClient} from '../apiClient'
import type {DuplicatesOnAddEvents, DuplicatesOnAddStatus} from '@shared/duplicatesOnAdd'

const base = '/api/duplicates-on-add'
export const duplicatesOnAddApi = {
  events: (after: number, signal?: AbortSignal) =>
    apiClient.get<DuplicatesOnAddEvents>(`${base}/events`, {params: {after}, signal}),
  pause: () => apiClient.post<DuplicatesOnAddStatus>(`${base}/pause`),
  resume: () => apiClient.post<DuplicatesOnAddStatus>(`${base}/resume`),
  skip: () => apiClient.post<DuplicatesOnAddStatus>(`${base}/skip`),
}
