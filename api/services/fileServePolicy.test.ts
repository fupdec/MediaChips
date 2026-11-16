import {describe, expect, it} from 'vitest'
import {evaluateFileServe} from './fileServePolicy'

const posix = {platform: 'linux' as const}

describe('evaluateFileServe', () => {
  it('serves ordinary media and text-preview files', () => {
    expect(evaluateFileServe('/Users/me/Movies/clip.mp4', posix).allowed).toBe(true)
    expect(evaluateFileServe('/media/nas/Photos/IMG_0001.HEIC', posix).allowed).toBe(true)
    expect(evaluateFileServe('/Users/me/Documents/notes.md', posix).allowed).toBe(true)
  })

  it('refuses credentials and hidden folders', () => {
    expect(evaluateFileServe('/Users/me/.ssh/id_ed25519', posix)).toEqual({allowed: false, reason: 'hidden-path'})
    expect(evaluateFileServe('/Users/me/.aws/credentials', posix).allowed).toBe(false)
    expect(evaluateFileServe('/srv/app/.env', posix)).toEqual({allowed: false, reason: 'sensitive-file'})
    expect(evaluateFileServe('/srv/app/.env.local', posix)).toEqual({allowed: false, reason: 'sensitive-file'})
  })

  it('refuses databases, keys and token stores anywhere', () => {
    expect(evaluateFileServe('/data/app_storage/default/db.sqlite', {...posix, trustedRoots: ['/data/app_storage']}).allowed).toBe(false)
    expect(evaluateFileServe('/data/drive/tokens.json', posix).allowed).toBe(false)
    expect(evaluateFileServe('/Users/me/Downloads/server.pem', posix).allowed).toBe(false)
  })

  it('refuses extensionless files like browser cookie stores', () => {
    expect(evaluateFileServe('/Users/me/Library/Application Support/Google/Chrome/Default/Cookies', posix).allowed).toBe(false)
    expect(evaluateFileServe('/Users/me/Downloads/README', posix)).toEqual({allowed: false, reason: 'no-extension'})
  })

  it('refuses OS internals', () => {
    expect(evaluateFileServe('/etc/passwd', posix)).toEqual({allowed: false, reason: 'system-path'})
    expect(evaluateFileServe('/proc/self/environ', posix)).toEqual({allowed: false, reason: 'system-path'})
    expect(evaluateFileServe('C:\\Windows\\System32\\config\\SAM.jpg', {platform: 'win32'})).toEqual({allowed: false, reason: 'system-path'})
  })

  it('trusts app storage for hidden or extensionless thumbs', () => {
    const options = {...posix, trustedRoots: ['/home/me/.config/MediaChips/app_storage']}
    expect(evaluateFileServe('/home/me/.config/MediaChips/app_storage/default/media/thumbs/42', options).allowed).toBe(true)
    expect(evaluateFileServe('/home/me/.config/other/secret.jpg', options).allowed).toBe(false)
  })
})
