import {describe, expect, it} from 'vitest'
import {BROWSER_SIDEBAR_TAG_NOTE} from '@/composable/useBrowserTagFilter'

describe('browser layout helpers', () => {
  it('exports a stable filter note for sidebar tag clicks', () => {
    expect(BROWSER_SIDEBAR_TAG_NOTE).toBe('browser-sidebar-tag')
  })
})
