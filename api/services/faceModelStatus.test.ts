import {describe, expect, it} from 'vitest'
import {resolveCachedModelStatus} from './faceModelStatus'

describe('resolveCachedModelStatus', () => {
  const base = {
    modelId: 'm',
    path: '/cache',
    sessionLoaded: false,
    loading: false,
    lastError: null as Error | null,
    downloaded: false,
  }

  it('reports disabled / loaded / loading / error / download states', () => {
    expect(resolveCachedModelStatus({...base, enabled: false}).status).toBe('disabled')
    expect(resolveCachedModelStatus({...base, sessionLoaded: true})).toMatchObject({
      status: 'loaded',
      path: '/cache',
    })
    expect(resolveCachedModelStatus({...base, loading: true}).status).toBe('loading')
    expect(resolveCachedModelStatus({
      ...base,
      lastError: new Error('boom'),
    })).toMatchObject({status: 'error', message: 'boom'})
    expect(resolveCachedModelStatus({...base, downloaded: true}).status).toBe('downloaded')
    expect(resolveCachedModelStatus(base).status).toBe('not_downloaded')
  })
})
