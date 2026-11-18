import type { AxiosRequestConfig } from 'axios'
import { apiClient } from '../apiClient'
import { API_ROUTES } from '@shared/api/routes'
import { parseAuthLoginResponse, parseAuthStatusResponse } from '@shared/schemas'
import { validated } from './validate'

export const authApi = {
  getAuthStatus() {
    return apiClient.get(API_ROUTES.authStatus).then((res) => ({
      ...res,
      data: validated(parseAuthStatusResponse, res.data),
    }))
  },

  login(password: string) {
    return apiClient.post(API_ROUTES.authLogin, { password }).then((res) => ({
      ...res,
      data: validated(parseAuthLoginResponse, res.data),
    }))
  },

  /** Checks a password without replacing the session; a wrong one does not lock the app. */
  verifyPassword(password: string) {
    const config = { skipAuthLock: true } as AxiosRequestConfig
    return apiClient.post(API_ROUTES.authLogin, { password }, config).then((res) => ({
      ...res,
      data: validated(parseAuthLoginResponse, res.data),
    }))
  },

  logout() {
    return apiClient.post(API_ROUTES.authLogout)
  },
}
