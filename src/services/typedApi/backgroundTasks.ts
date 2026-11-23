import {apiClient} from '../apiClient'
import type {BackgroundTasksResponse} from '@shared/backgroundTasks'

export const backgroundTasksApi = {
  list: (signal?: AbortSignal) => apiClient.get<BackgroundTasksResponse>('/api/background-tasks', {signal, timeout: 15_000}),
}
