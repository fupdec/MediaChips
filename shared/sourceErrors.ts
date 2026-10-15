/** Stable error categories shared by connection checks and folder browsing. */
export type SourceFailure = 'network_error' | 'permission_denied' | 'auth_required'
export function sourceRateLimited(error: unknown): boolean {
  const err = error as {response?: {status?: number; data?: {code?: string; error?: {errors?: Array<{reason?: string}>}}}}
  const data = err?.response?.data
  return err?.response?.status === 429 || data?.code === 'rate_limited'
    || (data?.error != null && typeof data.error === 'object' && Array.isArray(data.error.errors) && data.error.errors.some(item =>
      ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'downloadQuotaExceeded'].includes(item.reason || '')))
}
export function sourceFailure(error: unknown): SourceFailure | undefined {
  const err = error as {code?: string | number; level?: string; status?: number; message?: string;
    response?: {status?: number; data?: {code?: string; error?: string | {errors?: Array<{reason?: string}>}}}}
  const code = err?.response?.data?.code || err?.code
  const status = err?.response?.status || err?.status
  const oauth = err?.response?.data?.error
  if (['auth_required', 'credentials_required', 'credentials_missing', 'invalid_grant', 'expired', 'authentication_failed'].includes(String(code))
    || oauth === 'invalid_grant' || status === 401 || err?.level === 'client-authentication' || code === 530) return 'auth_required'
  // Quota errors also use HTTP 403; signing in or changing permissions cannot fix them.
  if (sourceRateLimited(error)) return undefined
  if (['permission_denied', 'access_denied', 'outside_root', 'EACCES', 'EPERM'].includes(String(code))
    || status === 403 || code === 3 || (code === 550 && /permission|denied|not allowed|access/i.test(err.message || ''))) return 'permission_denied'
  if (['network_error', 'ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'connection_closed'].includes(String(code))
    || err?.level === 'client-timeout') return 'network_error'
  return undefined
}
