import {describe, expect, it} from 'vitest'
import {resolveDistTarget} from './prune-native-binaries.mjs'

describe('resolveDistTarget', () => {
  it('maps explicit flags to prune targets', () => {
    expect(resolveDistTarget(['--mac'], 'linux')).toBe('mac')
    expect(resolveDistTarget(['--win'], 'darwin')).toBe('win')
    expect(resolveDistTarget(['--win-portable'], 'darwin')).toBe('win')
    expect(resolveDistTarget(['--linux'], 'darwin')).toBe('linux')
  })

  it('falls back to host platform when no flag is passed', () => {
    expect(resolveDistTarget([], 'darwin')).toBe('mac')
    expect(resolveDistTarget([], 'win32')).toBe('win')
    expect(resolveDistTarget([], 'linux')).toBe('linux')
  })
})
