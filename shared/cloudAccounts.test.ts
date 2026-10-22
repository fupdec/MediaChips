import {describe, it, expect} from 'vitest'
import {cloudMediaPath, parseCloudMediaPath, CloudAccountInputSchema} from './cloudAccounts'
import {isRemoteMediaPath} from './remoteMedia'
import {parseDriveMediaPath} from './cloudDrive'
const id = '11111111-1111-4111-8111-111111111111'
describe('account-scoped cloud addresses', () => {
  it.each(['gdrive', 'onedrive', 'dropbox'] as const)('round-trips %s opaque IDs without interpreting slashes or Unicode', provider => {
    const key = 'id:folder/文件!a?b#c'
    const path = cloudMediaPath(provider, id, key)
    expect(parseCloudMediaPath(path)).toEqual({provider, connectionId: id, resourceKey: key})
    expect(isRemoteMediaPath(path)).toBe(true)
    expect(parseDriveMediaPath(path)).toBeNull()
    expect(cloudMediaPath(provider, '22222222-2222-4222-8222-222222222222', key)).not.toBe(path)
  })
  it('retains legacy Drive paths and rejects malformed scoped paths', () => {
    expect(parseDriveMediaPath('gdrive://legacy')).toBe('legacy')
    expect(parseCloudMediaPath('gdrive://legacy')).toBeNull()
    for (const value of [`dropbox://${id}/%00secret`, `onedrive://${id}/file?token=secret`, `gdrive://${id}/%zz`, 'onedrive://not-an-account/file']) expect(parseCloudMediaPath(value)).toBeNull()
  })
  it('restricts redirects to the registered callback without credentials or query parameters', () => {
    const input = {provider: 'dropbox', name: 'Account', clientId: 'id', redirectUri: 'http://localhost:12321/api/cloud-accounts/oauth/callback'}
    expect(CloudAccountInputSchema.safeParse(input).success).toBe(true)
    for (const redirectUri of ['https://user:secret@example.test/api/cloud-accounts/oauth/callback', 'javascript:alert(1)', 'https://example.test/other', input.redirectUri + '?redirect=evil']) expect(CloudAccountInputSchema.safeParse({...input, redirectUri}).success).toBe(false)
  })
})
