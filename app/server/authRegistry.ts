import type { ApiDb } from '../../api/types/db'
import { createAuthService } from './auth'

interface AuthServiceOptions {
  dataDir?: string
}

let authService: ReturnType<typeof createAuthService> | null = null

function initAuthService(db: ApiDb, options: AuthServiceOptions = {}) {
  if (!authService) {
    authService = createAuthService(db, options)
  }
  return authService
}

function getAuthService(): ReturnType<typeof createAuthService> {
  if (!authService) {
    throw new Error('Auth service is not initialized')
  }
  return authService
}

export { initAuthService, getAuthService }
