import { describe, expect, it } from 'vitest'
import { shouldShowOsNotification } from '@/services/desktopChrome'

describe('shouldShowOsNotification', () => {
  it('shows success/warning/error by default', () => {
    expect(shouldShowOsNotification({ type: 'success', title: 'Done' })).toBe(true)
    expect(shouldShowOsNotification({ type: 'warning', title: 'Partial' })).toBe(true)
    expect(shouldShowOsNotification({ type: 'error', title: 'Failed' })).toBe(true)
  })

  it('skips sticky in-progress info toasts', () => {
    expect(shouldShowOsNotification({
      type: 'info',
      title: 'Scanning',
      timeout: 0,
    })).toBe(false)
  })

  it('shows completed info toasts', () => {
    expect(shouldShowOsNotification({
      type: 'info',
      title: 'No changes',
      timeout: 5000,
    })).toBe(true)
  })

  it('respects desktop override', () => {
    expect(shouldShowOsNotification({ type: 'success', desktop: false })).toBe(false)
    expect(shouldShowOsNotification({ type: 'info', timeout: 0, desktop: true })).toBe(true)
  })
})
