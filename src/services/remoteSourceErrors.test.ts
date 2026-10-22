import {describe, expect, it} from 'vitest'
import {remoteSourceErrorMessage, remoteMediaError} from './remoteSourceErrors'
import {sourceRetryAfter} from '@shared/sourceErrors'
import en from '@/i18n/en'
import ru from '@/i18n/ru'
import de from '@/i18n/de'
import es from '@/i18n/es'
import fr from '@/i18n/fr'
import pt from '@/i18n/pt'
import ja from '@/i18n/ja'
import cn from '@/i18n/cn'
const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? ':' + params.seconds : ''}`
describe('safe remote source errors', () => {
  it.each([
    [401, '', 'auth_required'], [403, '', 'permission_denied'], [410, '', 'session_expired'],
    [412, '', 'source_changed'], [404, '', 'not_found'], [503, '', 'network_error'],
    [409, 'auth_required', 'auth_required'], [409, 'source_changed', 'source_changed'],
    [400, 'unsupported_codec', 'unsupported_codec'], [400, 'unsupported_site', 'extraction_failed'],
    [0, 'ERR_NETWORK', 'network_error'], [429, '', 'rate_limited'],
  ])('maps %s/%s to a safe action', (status, code, key) => {
    expect(remoteSourceErrorMessage({response: {status, data: {code, message: 'secret https://signed/?token=private'}}}, t)).toBe(`remote_errors.${key}`)
  })
  it('uses the HLS rate limit category and delay', () => {
    expect(remoteSourceErrorMessage({code: 'rate_limited', retryAfter: 8}, t)).toBe('remote_errors.retry_after:8')
  })
  it('does not show raw exceptions or response bodies', () => {
    expect(remoteSourceErrorMessage(new Error('Bearer secret internal path'), t)).toBe('remote_errors.unknown')
  })
  it('uses a validated Retry-After and handles dates', () => {
    expect(remoteSourceErrorMessage({response: {status: 429, headers: {'retry-after': '15'}}}, t)).toBe('remote_errors.retry_after:15')
    expect(sourceRetryAfter({retryAfter: 'Wed, 21 Oct 2026 12:00:10 GMT'}, Date.parse('2026-10-21T12:00:00Z'))).toBe(10)
    for (const retryAfter of ['secret', '-1', Infinity, {}, 'https://internal']) expect(sourceRetryAfter({retryAfter})).toBeUndefined()
  })
  it('distinguishes decoder failures from lost network', () => {
    expect(remoteMediaError({code: 3} as MediaError).code).toBe('unsupported_codec')
    expect(remoteMediaError({code: 2} as MediaError).code).toBe('network_error')
  })
  it.each(Object.entries({en, ru, cn, de, es, fr, ja, pt}))('provides all error keys, placeholders and the refresh action in %s', (_locale, messages) => {
    expect(Object.keys(messages.remote_errors).sort()).toEqual(Object.keys(en.remote_errors).sort())
    for (const key of Object.keys(en.remote_errors) as Array<keyof typeof en.remote_errors>) {
      expect(messages.remote_errors[key].trim()).not.toBe('')
      expect(messages.remote_errors[key].match(/\{\w+\}/g) || []).toEqual(en.remote_errors[key].match(/\{\w+\}/g) || [])
    }
    expect(messages.player.controls.web_video_refresh.trim()).not.toBe('')
  })
})
