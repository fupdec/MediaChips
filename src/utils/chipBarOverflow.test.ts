import {describe, expect, it} from 'vitest'
import {recalcChipBarOverflow} from './chipBarOverflow'

function chip(width: number, extraClass = '') {
  const el = document.createElement('span')
  el.className = `entry ${extraClass}`.trim()
  Object.defineProperty(el, 'offsetWidth', {value: width, configurable: true})
  return el
}

describe('recalcChipBarOverflow', () => {
  it('hides trailing chips when they do not fit', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', {value: 120, configurable: true})
    const a = chip(50)
    const b = chip(50)
    const c = chip(50)
    const more = chip(40, 'more')
    el.append(a, b, c, more)

    const overflow = recalcChipBarOverflow(el, {
      chipSelector: ':scope > .entry:not(.more)',
      moreSelector: '.more',
      gap: 4,
    })

    expect(overflow).toBeGreaterThan(0)
    expect(a.classList.contains('chip-bar-entry--overflow-hidden')).toBe(false)
    expect(c.classList.contains('chip-bar-entry--overflow-hidden')).toBe(true)
  })
})
