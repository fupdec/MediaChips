import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const {setNotification, updateConfig, openPaywall} = vi.hoisted(() => ({
  setNotification: vi.fn(),
  updateConfig: vi.fn(async () => ({})),
  openPaywall: vi.fn(),
}))
vi.mock('@/services/notificationService', () => ({setNotification}))
vi.mock('@/services/configService', () => ({updateConfig}))
vi.mock('@/services/typedApi', () => ({typedApi: {}}))
vi.mock('@/i18n/loadLocale', () => ({i18n: {global: {t: (key: string) => key}}}))
vi.mock('@/stores/dialogs', () => ({useDialogsStore: () => ({openPaywall})}))

import {announceProTrialEndIfNeeded} from './proAccessConfig'
import {useAppStore} from '@/stores/app'
import {useRegistrationStore} from '@/stores/registration'

const DAY = 86400000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString()

function setup(config: Record<string, string>, machineId = 'machine-1') {
  setActivePinia(createPinia())
  useAppStore().config = {proAccessSettled: '1', proFeaturesGrandfathered: '0', proTrialEndNoticeShown: '0', ...config} as never
  useRegistrationStore().machineId = machineId
}

describe('announceProTrialEndIfNeeded', () => {
  beforeEach(() => {
    setNotification.mockClear()
    updateConfig.mockClear()
    openPaywall.mockClear()
  })

  it('announces once after the trial has ended and remembers it', async () => {
    setup({proTrialStartedAt: daysAgo(40)})
    await announceProTrialEndIfNeeded()
    expect(setNotification).toHaveBeenCalledTimes(1)
    expect(setNotification.mock.calls[0][0]).toMatchObject({
      title: 'registration.paywall_trial_ended',
      text: 'registration.trial_ended_notice',
      timeout: 0,
    })
    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({proTrialEndNoticeShown: '1'}))

    await announceProTrialEndIfNeeded()
    expect(setNotification).toHaveBeenCalledTimes(1)
  })

  it('opens the paywall when the notification is clicked', async () => {
    setup({proTrialStartedAt: daysAgo(40)})
    await announceProTrialEndIfNeeded()
    setNotification.mock.calls[0][0].click()
    expect(openPaywall).toHaveBeenCalled()
  })

  it('stays quiet while the trial is running', async () => {
    setup({proTrialStartedAt: daysAgo(10)})
    await announceProTrialEndIfNeeded()
    expect(setNotification).not.toHaveBeenCalled()
  })

  it('stays quiet for grandfathered installs and installs without a trial', async () => {
    setup({proFeaturesGrandfathered: '1', proTrialStartedAt: ''})
    await announceProTrialEndIfNeeded()
    setup({proTrialStartedAt: ''})
    await announceProTrialEndIfNeeded()
    expect(setNotification).not.toHaveBeenCalled()
  })

  it('waits for the machine id so a registered user is not told the trial ended', async () => {
    setup({proTrialStartedAt: daysAgo(40)}, '')
    await announceProTrialEndIfNeeded()
    expect(setNotification).not.toHaveBeenCalled()
    expect(updateConfig).not.toHaveBeenCalled()
  })

  it('does not repeat a notice that was already shown', async () => {
    setup({proTrialStartedAt: daysAgo(40), proTrialEndNoticeShown: '1'})
    await announceProTrialEndIfNeeded()
    expect(setNotification).not.toHaveBeenCalled()
  })

  it('treats the trial as over after a clock rollback', async () => {
    setup({proTrialStartedAt: daysAgo(5), proTrialLastSeenAt: new Date(Date.now() + 40 * DAY).toISOString()})
    await announceProTrialEndIfNeeded()
    expect(setNotification).toHaveBeenCalledTimes(1)
  })
})
