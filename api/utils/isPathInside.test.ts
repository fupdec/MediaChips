import path from 'path'
import {describe, expect, it} from 'vitest'
import {isPathInside} from './isPathInside'

describe('isPathInside', () => {
  it('allows the parent itself and nested children', () => {
    const parent = path.resolve('/tmp/plugin-dest')
    expect(isPathInside(parent, parent)).toBe(true)
    expect(isPathInside(parent, path.join(parent, 'a', 'b.js'))).toBe(true)
  })

  it('rejects zip-slip escapes', () => {
    const parent = path.resolve('/tmp/plugin-dest')
    expect(isPathInside(parent, path.resolve('/tmp/other'))).toBe(false)
    expect(isPathInside(parent, path.join(parent, '..', 'escape'))).toBe(false)
  })
})
