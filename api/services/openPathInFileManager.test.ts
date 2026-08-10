/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {
  isBenignWindowsExplorerExit,
  openPathInFileManager,
  shouldUseOsOpenCommands,
} from './openPathInFileManager'

describe('shouldUseOsOpenCommands', () => {
  it('is true for ELECTRON_RUN_AS_NODE children', () => {
    const previous = process.env.ELECTRON_RUN_AS_NODE
    process.env.ELECTRON_RUN_AS_NODE = '1'
    try {
      expect(shouldUseOsOpenCommands()).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE
      else process.env.ELECTRON_RUN_AS_NODE = previous
    }
  })
})

describe('isBenignWindowsExplorerExit', () => {
  it('treats explorer exit code 1 as success', () => {
    expect(isBenignWindowsExplorerExit({code: 1})).toBe(true)
    expect(isBenignWindowsExplorerExit({code: '1'})).toBe(true)
    expect(isBenignWindowsExplorerExit({code: 2})).toBe(false)
    expect(isBenignWindowsExplorerExit(new Error('boom'))).toBe(false)
  })
})

describe('openPathInFileManager', () => {
  it('reveals with open -R on macOS', async () => {
    const execFileImpl = vi.fn(async () => ({stdout: '', stderr: ''}))
    await openPathInFileManager('/Users/me/clip.mp4', {
      revealInFolder: true,
      platform: 'darwin',
      execFileImpl: execFileImpl as never,
    })
    expect(execFileImpl).toHaveBeenCalledWith('open', ['-R', '/Users/me/clip.mp4'])
  })

  it('uses explorer /select without shell quoting on Windows', async () => {
    const execFileImpl = vi.fn(async () => ({stdout: '', stderr: ''}))
    await openPathInFileManager('C:\\Videos\\clip.mp4', {
      revealInFolder: true,
      platform: 'win32',
      execFileImpl: execFileImpl as never,
    })
    expect(execFileImpl).toHaveBeenCalledWith('explorer.exe', ['/select,C:\\Videos\\clip.mp4'])
  })

  it('ignores benign Windows explorer exit codes', async () => {
    const execFileImpl = vi.fn(async () => {
      const error = Object.assign(new Error('Command failed'), {code: 1})
      throw error
    })
    await expect(openPathInFileManager('C:\\Videos', {
      platform: 'win32',
      execFileImpl: execFileImpl as never,
    })).resolves.toBeUndefined()
  })
})
