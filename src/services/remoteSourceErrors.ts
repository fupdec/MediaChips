import {sourceFailure, sourceRateLimited, sourceRetryAfter} from '@shared/sourceErrors'

type Translate = (key: string, params?: Record<string, unknown>) => string
/** Deliberately never render an exception message, URL, or upstream response body. */
export function remoteSourceErrorMessage(error: unknown, t: Translate): string {
  const err = error as {code?: string; status?: number; response?: {status?: number; data?: {code?: string}}}
  const code = err?.response?.data?.code || err?.code || ''
  const status = err?.response?.status || err?.status
  if (sourceRateLimited(error) || status === 429) {
    const seconds = sourceRetryAfter(error)
    return seconds === undefined ? t('remote_errors.rate_limited') : t('remote_errors.retry_after', {seconds})
  }
  const failure = sourceFailure(error)
  if (failure) return t(`remote_errors.${failure}`)
  if (['source_changed', 'original_changed', 'version_changed', 'source_version_changed'].includes(code) || status === 412) return t('remote_errors.source_changed')
  if (['session_expired', 'playback_session_expired', 'expired_session', 'stream_expired'].includes(code) || status === 410) return t('remote_errors.session_expired')
  if (['unsupported_codec', 'unsupported_media', 'unsupported_format', 'unsupported_playback', 'MEDIA_ERR_DECODE', 'MEDIA_ERR_SRC_NOT_SUPPORTED'].includes(code)) return t('remote_errors.unsupported_codec')
  if (['unsupported_url', 'unsupported_site', 'extractor_unavailable', 'extraction_failed', 'no_video'].includes(code)) return t('remote_errors.extraction_failed')
  if (['not_found', 'file_not_found', 'source_missing'].includes(code) || status === 404) return t('remote_errors.not_found')
  if (status === 502 || status === 503 || status === 504) return t('remote_errors.network_error')
  return t('remote_errors.unknown')
}

export function remoteMediaError(error: MediaError | null): {code: string} {
  return {code: error?.code === 3 || error?.code === 4 ? 'unsupported_codec' : error?.code === 2 ? 'network_error' : 'unknown'}
}
