import { describe, expect, it, vi } from 'vitest'
import { invalidateTagThumbCaches, setTagThumbVersion } from '@/utils/thumbDisplayCache'
import {
  invalidateTagThumbFileExistsCaches,
  refreshTagThumbDisplay,
} from '@/utils/tagThumbRefresh'

vi.mock('@/utils/thumbDisplayCache', () => ({
  invalidateTagThumbCaches: vi.fn(),
  setTagThumbVersion: vi.fn(),
}))

vi.mock('@/services/fileService', () => ({
  invalidateFileExistsCache: vi.fn(),
}))

import { invalidateFileExistsCache } from '@/services/fileService'

describe('tagThumbRefresh', () => {
  it('invalidates file existence caches for all tag image files', () => {
    invalidateTagThumbFileExistsCaches('/db', 18, 1626)

    expect(invalidateFileExistsCache).toHaveBeenCalledTimes(6)
    expect(invalidateFileExistsCache).toHaveBeenCalledWith('/db/meta/18/1626_main.jpg')
    expect(invalidateFileExistsCache).toHaveBeenCalledWith('/db/meta/18/1626_alt.jpg')
    expect(invalidateFileExistsCache).toHaveBeenCalledWith('/db/meta/18/1626_custom1.jpg')
    expect(invalidateFileExistsCache).toHaveBeenCalledWith('/db/meta/18/1626_custom2.jpg')
  })

  it('invalidates thumb caches, bumps version, and refreshes the card thumb', () => {
    const itemsStore = { refreshThumb: vi.fn() }

    refreshTagThumbDisplay(itemsStore, '/db', 18, 1626)

    expect(invalidateTagThumbCaches).toHaveBeenCalledWith(18, 1626)
    expect(invalidateFileExistsCache).toHaveBeenCalledWith('/db/meta/18/1626_main.jpg')
    expect(setTagThumbVersion).toHaveBeenCalledWith(18, 1626)
    expect(itemsStore.refreshThumb).toHaveBeenCalledWith(1626)
  })
})
