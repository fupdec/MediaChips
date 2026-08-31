import { describe, expect, it } from 'vitest'
import { isAlreadyInactiveOnServerMessage } from './registration'

describe('isAlreadyInactiveOnServerMessage', () => {
  it('detects the license API inactive-device message', () => {
    expect(isAlreadyInactiveOnServerMessage('The app is not registered on this device.')).toBe(true)
  })

  it('rejects unrelated messages', () => {
    expect(isAlreadyInactiveOnServerMessage('Deactivation failed')).toBe(false)
    expect(isAlreadyInactiveOnServerMessage('')).toBe(false)
    expect(isAlreadyInactiveOnServerMessage(null)).toBe(false)
    expect(isAlreadyInactiveOnServerMessage(undefined)).toBe(false)
  })
})
