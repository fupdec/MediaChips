import {describe, expect, it} from 'vitest'
import os from 'os'
import path from 'path'
import {listSystemPlaceRootPaths, listSystemPlaces} from './systemPlaces'

describe('systemPlaces', () => {
  it('includes home and known user folders when they exist', () => {
    const places = listSystemPlaces()
    const ids = places.map((place) => place.id)

    expect(ids).toContain('home')
    expect(places.find((place) => place.id === 'home')?.path).toBe(path.resolve(os.homedir()))

    if (process.platform !== 'win32') {
      expect(ids).toContain('computer')
    }
  })

  it('returns unique root paths for browse confinement', () => {
    const roots = listSystemPlaceRootPaths()
    expect(roots.length).toBeGreaterThan(0)
    expect(new Set(roots).size).toBe(roots.length)
  })
})
