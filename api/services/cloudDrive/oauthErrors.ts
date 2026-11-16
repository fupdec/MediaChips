import axios from 'axios'

export type DriveOAuthErrorCode = 'cancelled' | 'expired' | 'access_denied' | 'invalid_client' | 'invalid_grant'
  | 'redirect_uri_mismatch' | 'network_error' | 'token_storage_error' | 'unknown'

export class DriveOAuthError extends Error {
  constructor(public readonly code: DriveOAuthErrorCode) { super(`Google Drive OAuth: ${code}`) }
}

/** Never expose Axios request data: it contains the authorization code and client secret. */
export function driveOAuthErrorCode(error: unknown): DriveOAuthErrorCode {
  if (error instanceof DriveOAuthError) return error.code
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.error
    if (['access_denied', 'invalid_client', 'invalid_grant', 'redirect_uri_mismatch'].includes(code)) return code
    if (!error.response) return 'network_error'
  }
  const code = (error as NodeJS.ErrnoException)?.code
  if (['EACCES', 'EPERM', 'EROFS', 'ENOSPC'].includes(code || '')) return 'token_storage_error'
  return 'unknown'
}

export const driveOAuthErrorMessages: Record<DriveOAuthErrorCode, string> = {
  cancelled: 'Google sign-in was cancelled. / Вход отменён.',
  expired: 'The sign-in session expired or the server restarted. Start sign-in again. / Сеанс входа истёк или сервер перезапустился. Начните вход заново.',
  access_denied: 'Google Drive access was not granted. / Доступ к Google Drive не предоставлен.',
  invalid_client: 'Check the Google OAuth Client ID and Client Secret. / Проверьте Google OAuth Client ID и Client Secret.',
  invalid_grant: 'Google rejected the authorization code. Start sign-in again. / Google отклонил код авторизации. Начните вход заново.',
  redirect_uri_mismatch: 'The OAuth redirect URI does not match the Google client settings. / Адрес возврата OAuth не совпадает с настройками клиента Google.',
  network_error: 'MediaChips could not connect to Google to finish sign-in. Check the server network or proxy. / MediaChips не удалось связаться с Google для завершения входа. Проверьте сеть или прокси сервера.',
  token_storage_error: 'MediaChips could not save the Google authorization. Check storage permissions and free space. / MediaChips не удалось сохранить подключение Google. Проверьте права на папку данных и свободное место.',
  unknown: 'Google sign-in could not be completed. / Не удалось завершить подключение Google.',
}
