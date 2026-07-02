import {beforeEach, describe, expect, it, vi} from 'vitest'
import {copyToClipboard} from '@/utils/copyToClipboard'

const setNotification = vi.fn()

vi.mock('@/services/notificationService', () => ({
  setNotification: (...args: unknown[]) => setNotification(...args),
}))

describe('copyToClipboard', () => {
  beforeEach(() => {
    setNotification.mockClear()
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('copies trimmed text and shows notification', async () => {
    const result = await copyToClipboard('  hello  ', {successText: 'Copied'})

    expect(result).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
    expect(setNotification).toHaveBeenCalledWith({
      type: 'success',
      text: 'Copied',
    })
  })

  it('returns false for empty text', async () => {
    const result = await copyToClipboard('   ')

    expect(result).toBe(false)
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(setNotification).not.toHaveBeenCalled()
  })

  it('can copy silently', async () => {
    const result = await copyToClipboard('path', {successText: 'Copied', silent: true})

    expect(result).toBe(true)
    expect(setNotification).not.toHaveBeenCalled()
  })
})
