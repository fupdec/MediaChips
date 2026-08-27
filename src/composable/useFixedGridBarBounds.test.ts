import {describe, expect, it} from 'vitest'
import {resolveFixedGridBarAnchor} from './useFixedGridBarBounds'

describe('resolveFixedGridBarAnchor', () => {
  it('prefers the card grid over the control deck', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="items-layout-container">
        <div id="items-control-deck" class="items-control-deck"></div>
        <div class="items-page-grid"></div>
      </div>
    `
    const el = resolveFixedGridBarAnchor(root)
    expect(el?.className).toBe('items-page-grid')
  })

  it('falls back to the control deck when the grid is missing', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="items-layout-container">
        <div id="items-control-deck" class="items-control-deck"></div>
      </div>
    `
    const el = resolveFixedGridBarAnchor(root)
    expect(el?.id).toBe('items-control-deck')
  })

  it('falls back to the page container when the deck is missing', () => {
    const root = document.createElement('div')
    root.innerHTML = `<div class="all-tags-page"></div>`
    const el = resolveFixedGridBarAnchor(root)
    expect(el?.className).toBe('all-tags-page')
  })
})
