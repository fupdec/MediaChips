/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  getTrayMenuLabels,
  normalizeTrayMenuLocale,
} from './trayMenuI18n'

describe('trayMenuI18n', () => {
  it('normalizes unknown locales to en', () => {
    expect(normalizeTrayMenuLocale('ru')).toBe('ru')
    expect(normalizeTrayMenuLocale('xx')).toBe('en')
  })

  it('returns localized labels', () => {
    expect(getTrayMenuLabels('en').settings).toBe('Settings')
    expect(getTrayMenuLabels('ru').settings).toBe('Настройки')
    expect(getTrayMenuLabels('de').addMedia).toBe('Medien hinzufügen')
  })
})
