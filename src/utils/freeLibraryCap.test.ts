import {describe, expect, it} from 'vitest'
import {
  FREE_LIBRARY_CAP,
  decideFreeLibraryCapMigration,
  freeLibraryRemainingSlots,
  isFreeLibraryAtCap,
  isFreeLibraryExempt,
  isFreeLibraryNearCap,
  shouldBlockFreeLibraryImport,
} from './freeLibraryCap'

describe('freeLibraryCap', () => {
  it('computes remaining slots', () => {
    expect(freeLibraryRemainingSlots(0)).toBe(FREE_LIBRARY_CAP)
    expect(freeLibraryRemainingSlots(40)).toBe(FREE_LIBRARY_CAP - 40)
    expect(freeLibraryRemainingSlots(FREE_LIBRARY_CAP)).toBe(0)
    expect(freeLibraryRemainingSlots(FREE_LIBRARY_CAP + 10)).toBe(0)
  })

  it('does not gate registered or grandfathered users', () => {
    expect(isFreeLibraryExempt({registered: true})).toBe(true)
    expect(isFreeLibraryExempt({registered: false, grandfathered: true})).toBe(true)
    expect(isFreeLibraryAtCap({registered: true, libraryCount: 10_000})).toBe(false)
    expect(isFreeLibraryAtCap({
      registered: false,
      grandfathered: true,
      libraryCount: 10_000,
    })).toBe(false)
    expect(shouldBlockFreeLibraryImport({
      registered: false,
      grandfathered: true,
      libraryCount: 10_000,
    })).toBe(false)
  })

  it('blocks unregistered users at the free cap', () => {
    expect(isFreeLibraryAtCap({registered: false, libraryCount: FREE_LIBRARY_CAP - 1})).toBe(false)
    expect(isFreeLibraryAtCap({registered: false, libraryCount: FREE_LIBRARY_CAP})).toBe(true)
    expect(shouldBlockFreeLibraryImport({registered: false, libraryCount: FREE_LIBRARY_CAP})).toBe(true)
  })

  it('shows soft warning near the free cap', () => {
    const softFloor = Math.floor(FREE_LIBRARY_CAP * 0.8)
    expect(isFreeLibraryNearCap({registered: false, libraryCount: softFloor - 1})).toBe(false)
    expect(isFreeLibraryNearCap({registered: false, libraryCount: softFloor})).toBe(true)
    expect(isFreeLibraryNearCap({registered: false, libraryCount: FREE_LIBRARY_CAP})).toBe(false)
  })

  it('decides one-time grandfather migration', () => {
    expect(decideFreeLibraryCapMigration({settled: true, libraryCount: 5000})).toEqual({run: false})
    expect(decideFreeLibraryCapMigration({settled: false, libraryCount: FREE_LIBRARY_CAP})).toEqual({
      run: true,
      grandfathered: false,
    })
    expect(decideFreeLibraryCapMigration({
      settled: false,
      libraryCount: FREE_LIBRARY_CAP + 1,
    })).toEqual({
      run: true,
      grandfathered: true,
    })
  })
})
