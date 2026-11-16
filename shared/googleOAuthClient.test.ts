import {describe, expect, it} from 'vitest'
import {googleClientRedirect, parseGoogleOAuthClientFile} from './googleOAuthClient'

const id = '123-abc.apps.googleusercontent.com'
describe('google OAuth client file', () => {
  it('parses desktop clients without redirect registration', () => {
    const file = parseGoogleOAuthClientFile(JSON.stringify({installed: {client_id: id, client_secret: ' GOCSPX-x ', redirect_uris: ['http://localhost']}}))
    expect(file).toEqual({type: 'installed', clientId: id, clientSecret: 'GOCSPX-x', redirectUris: ['http://localhost']})
    expect(googleClientRedirect(file!, 'http://127.0.0.1:12321/api/drive/oauth/callback', '/api/drive/oauth/callback')).toEqual({registered: true})
  })
  it('detects unregistered web callbacks', () => {
    const file = parseGoogleOAuthClientFile(JSON.stringify({web: {client_id: id, client_secret: 's', redirect_uris: ['http://localhost:3000/cb']}}))!
    expect(googleClientRedirect(file, 'http://127.0.0.1:12321/api/drive/oauth/callback', '/api/drive/oauth/callback')).toEqual({registered: false})
    const ok = {...file, redirectUris: ['http://127.0.0.1:12321/api/drive/oauth/callback']}
    expect(googleClientRedirect(ok, 'http://127.0.0.1:12321/api/drive/oauth/callback', '/api/drive/oauth/callback')).toEqual({registered: true})
  })
  it('rejects unrelated JSON', () => {
    expect(parseGoogleOAuthClientFile('{"foo":1}')).toBeNull()
    expect(parseGoogleOAuthClientFile('not json')).toBeNull()
  })
})
