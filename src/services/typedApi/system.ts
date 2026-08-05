import type {AxiosRequestConfig} from 'axios'
import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import {
  parseMachineId,
  parsePingResponse,
  parseServerConfig,
} from '@shared/schemas'
import {validated} from './validate'

export type ServerConfig = {
  appVersion?: string
  path?: string
  databases?: unknown[]
  ip?: string
  port?: number | string
  allowLanAccess?: boolean
  allowLanAccessEnvLocked?: boolean
  registration?: string
  [key: string]: unknown
}

export type PingResponse = {
  pong?: number | string
  ip?: string
  port?: number | string
  message?: string
  [key: string]: unknown
}

export const systemApi = {
  ping(config: AxiosRequestConfig = {}) {
    return apiClient.get(API_ROUTES.ping, config).then((res) => ({
      ...res,
      data: validated(parsePingResponse, res.data) as PingResponse,
    }))
  },

  getServerConfig(config: AxiosRequestConfig = {}) {
    return apiClient.get(API_ROUTES.config, config).then((res) => ({
      ...res,
      data: validated(parseServerConfig, res.data) as ServerConfig,
    }))
  },

  getTaskConfig(config: AxiosRequestConfig = {}) {
    return apiClient.get(API_ROUTES.taskGetConfig, config).then((res) => ({
      ...res,
      data: validated(parseServerConfig, res.data) as ServerConfig,
    }))
  },

  getMachineId(config: AxiosRequestConfig & {path?: string} = {}) {
    const {path = API_ROUTES.getMachineId, ...requestConfig} = config
    return apiClient.get(path, requestConfig).then((res) => ({
      ...res,
      data: validated(parseMachineId, res.data),
    }))
  },
}
