import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  isStartupHealthNotificationsEnabled,
  resetStartupHealthNotifications,
} from '@/composable/useStartupHealthNotifications'

const push = vi.fn()
const setNotification = vi.fn()
const getHomeHealthLite = vi.fn()
const settingsState = vi.hoisted(() => ({
  startupHealthNotifications: '1' as string,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({push}),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${JSON.stringify(params)}`
    },
  }),
}))

vi.mock('@/services/notificationService', () => ({
  setNotification: (...args: unknown[]) => setNotification(...args),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    getHomeHealthLite: (...args: unknown[]) => getHomeHealthLite(...args),
  },
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => settingsState,
}))

describe('useStartupHealthNotifications', () => {
  beforeEach(() => {
    resetStartupHealthNotifications()
    push.mockReset()
    setNotification.mockReset()
    getHomeHealthLite.mockReset()
    settingsState.startupHealthNotifications = '1'
  })

  it('treats missing or non-zero values as enabled', () => {
    expect(isStartupHealthNotificationsEnabled('1')).toBe(true)
    expect(isStartupHealthNotificationsEnabled(undefined)).toBe(true)
    expect(isStartupHealthNotificationsEnabled('0')).toBe(false)
  })

  it('skips the check when disabled in settings', async () => {
    settingsState.startupHealthNotifications = '0'
    getHomeHealthLite.mockResolvedValue({data: {}})

    const {useStartupHealthNotifications} = await import('@/composable/useStartupHealthNotifications')
    const {runStartupHealthCheck} = useStartupHealthNotifications()
    await runStartupHealthCheck(1)

    expect(getHomeHealthLite).not.toHaveBeenCalled()
    expect(setNotification).not.toHaveBeenCalled()
  })

  it('notifies once per issue per session', async () => {
    getHomeHealthLite.mockResolvedValue({
      data: {
        fingerprint: {total: 10, pending: 2, hashed: 8},
        contentHash: {total: 0, pending: 0, hashed: 0},
        oshash: {total: 0, pending: 0, hashed: 0},
        videoCodec: {total: 5, pending: 1, filled: 4},
        tagImageAiUpscale: {done: false, suggested: true, downloadSizeMb: 50},
      },
    })

    const {useStartupHealthNotifications} = await import('@/composable/useStartupHealthNotifications')
    const {runStartupHealthCheck} = useStartupHealthNotifications()

    await runStartupHealthCheck(1)
    await runStartupHealthCheck(1)

    const ids = setNotification.mock.calls.map((call) => call[0].actions?.[0]?.id)
    expect(ids.filter((id) => id === 'fingerprint')).toHaveLength(1)
    expect(ids.filter((id) => id === 'video-codec')).toHaveLength(1)
    expect(ids.filter((id) => id === 'tag-ai-upscale')).toHaveLength(1)
    expect(setNotification).toHaveBeenCalledTimes(3)
  })

  it('skips tag upscale notification when migration is done', async () => {
    getHomeHealthLite.mockResolvedValue({
      data: {
        fingerprint: {total: 0, pending: 0, hashed: 0},
        contentHash: {total: 0, pending: 0, hashed: 0},
        oshash: {total: 0, pending: 0, hashed: 0},
        videoCodec: {total: 0, pending: 0, filled: 0},
        tagImageAiUpscale: {done: true, suggested: false},
      },
    })

    const {useStartupHealthNotifications} = await import('@/composable/useStartupHealthNotifications')
    const {runStartupHealthCheck} = useStartupHealthNotifications()
    await runStartupHealthCheck('db')
    expect(setNotification).not.toHaveBeenCalled()
  })
})
