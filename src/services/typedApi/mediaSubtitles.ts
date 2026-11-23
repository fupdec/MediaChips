import type {AxiosRequestConfig} from 'axios'
import {apiClient} from '../apiClient'
import type {MediaSubtitleList, SubtitleFile} from '@shared/subtitles'

const base = (id: number) => `/api/Media/${id}/subtitles`

export const mediaSubtitlesApi = {
  list: (id: number, config?: AxiosRequestConfig) => apiClient.get<MediaSubtitleList>(base(id), config),
  read: (id: number, name: string, config?: AxiosRequestConfig) => apiClient.get<SubtitleFile>(`${base(id)}/${encodeURIComponent(name)}`, config),
}
