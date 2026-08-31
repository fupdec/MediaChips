import {describe, expect, it} from 'vitest'
import {isLibraryNavLinkActive} from './libraryNavActive'

describe('isLibraryNavLinkActive', () => {
  it('does not treat every route as home just because home is "/"', () => {
    expect(isLibraryNavLinkActive({to: '/'}, {path: '/', query: {}})).toBe(true)
    expect(isLibraryNavLinkActive({to: '/'}, {path: '/settings', query: {}})).toBe(false)
    expect(isLibraryNavLinkActive({to: '/'}, {path: '/folders', query: {}})).toBe(false)
  })

  it('matches exact paths without query', () => {
    expect(isLibraryNavLinkActive(
      {to: '/folders', exact: true},
      {path: '/folders', query: {}},
    )).toBe(true)
    expect(isLibraryNavLinkActive(
      {to: '/folders', exact: true},
      {path: '/settings', query: {}},
    )).toBe(false)
  })

  it('matches query params for media/meta links', () => {
    expect(isLibraryNavLinkActive(
      {to: '/media?mediaTypeId=2', exact: true},
      {path: '/media', query: {mediaTypeId: '2'}},
    )).toBe(true)
    expect(isLibraryNavLinkActive(
      {to: '/media?mediaTypeId=2', exact: true},
      {path: '/media', query: {mediaTypeId: '3'}},
    )).toBe(false)
    expect(isLibraryNavLinkActive(
      {to: '/meta?metaId=1', exact: true},
      {path: '/meta', query: {metaId: '1', sort: 'name'}},
    )).toBe(true)
  })

  it('matches settings and tags by path', () => {
    expect(isLibraryNavLinkActive(
      {to: '/settings'},
      {path: '/settings', query: {}},
    )).toBe(true)
    expect(isLibraryNavLinkActive(
      {to: '/tags', exact: true},
      {path: '/tags', query: {}},
    )).toBe(true)
    expect(isLibraryNavLinkActive(
      {to: '/tags', exact: true},
      {path: '/tag', query: {}},
    )).toBe(false)
  })
})
