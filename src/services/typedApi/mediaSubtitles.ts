import {apiClient} from '../apiClient'
import type {MediaSubtitleList, SubtitleFile} from '@shared/subtitles'

const base = (id: number) => `/api/Media/${id}/subtitles`

export const mediaSubtitlesApi = {
  list: (id: number) => apiClient.get<MediaSubtitleList>(base(id)),
  read: (id: number, name: string) => apiClient.get<SubtitleFile>(`${base(id)}/${encodeURIComponent(name)}`),
}
