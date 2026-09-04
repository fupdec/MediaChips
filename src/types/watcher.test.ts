import { describe, expect, it } from 'vitest'
import { shouldClearWatcherBusyOnMessage } from './watcher'

describe('shouldClearWatcherBusyOnMessage', () => {
  it('keeps busy through scanStart', () => {
    expect(shouldClearWatcherBusyOnMessage('scanStart')).toBe(false)
  })

  it('clears busy on files, scanComplete, and closed', () => {
    expect(shouldClearWatcherBusyOnMessage('files')).toBe(true)
    expect(shouldClearWatcherBusyOnMessage('scanComplete')).toBe(true)
    expect(shouldClearWatcherBusyOnMessage('closed')).toBe(true)
  })
})
