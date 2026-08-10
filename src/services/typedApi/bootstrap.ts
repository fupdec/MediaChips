import { apiClient } from '../apiClient'
import { API_ROUTES, apiSetting } from '@shared/api/routes'
import type { SettingEntry } from '@shared/api/responses'
import type { MediaType } from '@shared/entities/media'
import type { Meta, Tag } from '@shared/entities/meta'
import type { Playlist } from '@shared/entities/playlist'
import type { Tab } from '@shared/entities/tab'
import {
  parseMediaTypes,
  parseMetaList,
  parsePlaylists,
  parseSetting,
  parseSettings,
  parseTabs,
  parseTags,
} from '@shared/schemas'
import { validated } from './validate'

export const bootstrapApi = {
  getMediaTypes() {
    return apiClient.get<MediaType[]>(API_ROUTES.mediaType).then((res) => ({
      ...res,
      data: validated(parseMediaTypes, res.data),
    }))
  },

  getTags() {
    return apiClient.get<Tag[]>(API_ROUTES.tag).then((res) => ({
      ...res,
      data: validated(parseTags, res.data),
    }))
  },

  getMeta() {
    return apiClient.get<Meta[]>(API_ROUTES.meta).then((res) => ({
      ...res,
      data: validated(parseMetaList, res.data),
    }))
  },

  getTabs() {
    return apiClient.get<Tab[]>(API_ROUTES.tab).then((res) => ({
      ...res,
      data: validated(parseTabs, res.data),
    }))
  },

  getPlaylists() {
    return apiClient.get<Playlist[]>(API_ROUTES.playlist).then((res) => ({
      ...res,
      data: validated(parsePlaylists, res.data),
    }))
  },

  getSettings() {
    return apiClient.get<SettingEntry[]>(API_ROUTES.setting, {timeout: 15000}).then((res) => ({
      ...res,
      data: validated(parseSettings, res.data),
    }))
  },

  getSetting(option: string) {
    return apiClient.get(apiSetting(option)).then((res) => ({
      ...res,
      data: validated(parseSetting, res.data),
    }))
  },

  putSetting(option: string, value: string) {
    return apiClient.put(apiSetting(option), { value }).then((res) => ({
      ...res,
      data: validated(parseSetting, res.data),
    }))
  },
}
