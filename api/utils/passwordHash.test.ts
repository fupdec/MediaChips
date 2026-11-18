import {describe, expect, it} from 'vitest'
import {hashPassword, isPasswordHash, safeEqual, verifyStoredPassword} from './passwordHash'

describe('passwordHash', () => {
  it('hashes with a fresh salt and verifies the right password only', async () => {
    const first = await hashPassword('hunter2')
    const second = await hashPassword('hunter2')
    expect(isPasswordHash(first)).toBe(true)
    expect(first).not.toBe(second)
    expect(first.includes('hunter2')).toBe(false)
    expect(await verifyStoredPassword('hunter2', first)).toBe(true)
    expect(await verifyStoredPassword('hunter3', first)).toBe(false)
    expect(await verifyStoredPassword('', first)).toBe(false)
  })

  it('still accepts legacy plain-text phrases', async () => {
    expect(isPasswordHash('1234')).toBe(false)
    expect(await verifyStoredPassword('1234', '1234')).toBe(true)
    expect(await verifyStoredPassword('12345', '1234')).toBe(false)
    expect(await verifyStoredPassword('', '')).toBe(true)
  })

  it('rejects malformed hashes instead of throwing', async () => {
    expect(await verifyStoredPassword('x', 'scrypt$0$8$1$AAAA$AAAA')).toBe(false)
    expect(await verifyStoredPassword('x', 'scrypt$16384$8$1$AAAA$')).toBe(false)
  })

  it('compares in constant time without length leaks', () => {
    expect(safeEqual('secret', 'secret')).toBe(true)
    expect(safeEqual('secret', 'secreT')).toBe(false)
    expect(safeEqual('', 'secret')).toBe(false)
  })
})
