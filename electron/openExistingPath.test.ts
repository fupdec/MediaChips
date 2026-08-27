/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {openExistingPath} from './openExistingPath'

function hooks(overrides: Partial<Parameters<typeof openExistingPath>[2]> = {}) {
  return {
    openPath: vi.fn(async () => ''),
    showItemInFolder: vi.fn(),
    openInFileManager: vi.fn(async () => undefined),
    resolvePath: (target: string) => target,
    isDirectory: () => false,
    replyTimeoutMs: 50,
    ...overrides,
  }
}

describe('openExistingPath', () => {
  it('opens directories via the OS file manager instead of shell.openPath', async () => {
    const deps = hooks({isDirectory: () => true})
    await expect(openExistingPath('C:\\Users\\me\\app_storage\\db', false, deps))
      .resolves.toEqual({success: true})
    expect(deps.openInFileManager).toHaveBeenCalledWith(
      'C:\\Users\\me\\app_storage\\db',
      {revealInFolder: false},
    )
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('falls back to shell.openPath when the directory file-manager open fails', async () => {
    const deps = hooks({
      isDirectory: () => true,
      openInFileManager: vi.fn(async () => {
        throw new Error('explorer failed')
      }),
    })
    await expect(openExistingPath('/tmp/data', false, deps))
      .resolves.toEqual({success: true})
    expect(deps.openPath).toHaveBeenCalledWith('/tmp/data')
  })

  it('falls back to the file manager when shell.openPath returns Failed to open path', async () => {
    const deps = hooks({
      openPath: vi.fn(async () => 'Failed to open path'),
    })
    await expect(openExistingPath('/tmp/clip.mp4', false, deps))
      .resolves.toEqual({success: true})
    expect(deps.openInFileManager).toHaveBeenCalledWith('/tmp/clip.mp4', {revealInFolder: false})
  })

  it('returns the Electron error when both open strategies fail', async () => {
    const deps = hooks({
      openPath: vi.fn(async () => 'Failed to open path'),
      openInFileManager: vi.fn(async () => {
        throw new Error('Command failed')
      }),
    })
    await expect(openExistingPath('/tmp/clip.mp4', false, deps))
      .resolves.toEqual({error: 'Failed to open path'})
  })

  it('reveals in the parent folder and falls back if showItemInFolder throws', async () => {
    const deps = hooks({
      showItemInFolder: vi.fn(() => {
        throw new Error('no finder')
      }),
    })
    await expect(openExistingPath('/tmp/clip.mp4', true, deps))
      .resolves.toEqual({success: true})
    expect(deps.openInFileManager).toHaveBeenCalledWith('/tmp/clip.mp4', {revealInFolder: true})
  })

  it('resolves relative paths before opening', async () => {
    const deps = hooks({
      resolvePath: (target: string) => `/abs/${target}`,
      isDirectory: () => true,
    })
    await openExistingPath('data', false, deps)
    expect(deps.openInFileManager).toHaveBeenCalledWith('/abs/data', {revealInFolder: false})
  })
})
