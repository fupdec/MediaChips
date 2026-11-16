import {describe, expect, it} from 'vitest'
import en from './en'
import ru from './ru'
import de from './de'
import es from './es'
import fr from './fr'
import ja from './ja'
import pt from './pt'
import cn from './cn'
import ko from './ko'
import pl from './pl'
import tr from './tr'
import itLocale from './it'
import tw from './tw'

type Messages = Record<string, unknown>

function flattenKeys(messages: Messages, prefix = '', keys: string[] = []): string[] {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenKeys(value as Messages, path, keys)
    else keys.push(path)
  }
  return keys
}

function flattenStrings(messages: Messages, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenStrings(value as Messages, path, out)
    else if (typeof value === 'string') out[path] = value
  }
  return out
}

const placeholders = (text: string) => (text.match(/\{[^}]+\}/g) ?? []).sort()

const reference = new Set(flattenKeys(en))
const enStrings = flattenStrings(en)

// Fully translated locales: every key of en must exist.
const fullLocales: Record<string, Messages> = {ru, de, es, fr, ja, pt, cn}
// Partial locales: only the core UI is translated, the rest falls back to en (vue-i18n fallbackLocale).
const partialLocales: Record<string, Messages> = {ko, pl, tr, it: itLocale, tw}
const PARTIAL_MIN_KEYS = 1400

describe('i18n locales match en keys', () => {
  it.each(Object.keys(fullLocales))('%s has no missing or extra keys', (locale) => {
    const keys = new Set(flattenKeys(fullLocales[locale]))
    const missing = [...reference].filter(key => !keys.has(key))
    const extra = [...keys].filter(key => !reference.has(key))
    expect({missing, extra}).toEqual({missing: [], extra: []})
  })
})

describe('partial i18n locales', () => {
  it.each(Object.keys(partialLocales))('%s has no extra keys and covers the core UI', (locale) => {
    const keys = flattenKeys(partialLocales[locale])
    expect(keys.filter(key => !reference.has(key))).toEqual([])
    expect(keys.length).toBeGreaterThanOrEqual(PARTIAL_MIN_KEYS)
  })

  it.each(Object.keys(partialLocales))('%s keeps the same {placeholders} as en', (locale) => {
    const bad = Object.entries(flattenStrings(partialLocales[locale]))
      .filter(([key, text]) => key in enStrings && placeholders(text).join() !== placeholders(enStrings[key]).join())
      .map(([key]) => key)
    expect(bad).toEqual([])
  })
})
