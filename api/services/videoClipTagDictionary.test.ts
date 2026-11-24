import {describe, expect, it} from 'vitest'
import {getLocalizedLabel, getPromptEntries, tags} from './videoClipTagDictionary'

const LOCALES = ['en', 'de', 'fr', 'ja', 'pt', 'ru', 'es', 'cn']

describe('videoClipTagDictionary data', () => {
  it('has unique, non-empty keys', () => {
    const keys = tags.map((tag) => tag.key)
    expect(keys.every((key) => /^[a-z][a-z0-9_]*$/.test(key))).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('labels every tag in every supported locale', () => {
    for (const tag of tags) {
      for (const locale of LOCALES) {
        expect(tag.labels[locale as keyof typeof tag.labels], `${tag.key}/${locale}`).toBeTruthy()
      }
    }
  })

  it('gives every tag at least one non-empty, trimmed, distinct prompt', () => {
    for (const tag of tags) {
      expect(tag.prompts.length, tag.key).toBeGreaterThan(0)
      expect(new Set(tag.prompts).size, tag.key).toBe(tag.prompts.length)
      for (const prompt of tag.prompts) expect(prompt, tag.key).toBe(prompt.trim())
      for (const prompt of tag.prompts) expect(prompt.length, tag.key).toBeGreaterThan(0)
    }
  })
})

describe('getLocalizedLabel', () => {
  const dog = tags.find((tag) => tag.key === 'dog')!

  it('returns the label for the requested locale', () => {
    expect(getLocalizedLabel(dog, 'de')).toBe('Hund')
    expect(getLocalizedLabel(dog, 'ru')).toBe('собака')
  })

  it('defaults to English', () => {
    expect(getLocalizedLabel(dog)).toBe('dog')
  })

  it('falls back to English for an unknown locale, then to the key', () => {
    expect(getLocalizedLabel(dog, 'xx')).toBe('dog')
    expect(getLocalizedLabel({key: 'custom', labels: {}}, 'de')).toBe('custom')
    expect(getLocalizedLabel({key: 'custom'}, 'de')).toBe('custom')
    expect(getLocalizedLabel({}, 'de')).toBe('')
  })
})

describe('getPromptEntries', () => {
  it('flattens every prompt with the key of its tag', () => {
    const entries = getPromptEntries()
    expect(entries.length).toBe(tags.reduce((sum, tag) => sum + tag.prompts.length, 0))
    expect(entries).toContainEqual({key: 'dog', prompt: 'pet dog'})
    for (const entry of entries) {
      expect(tags.some((tag) => tag.key === entry.key && tag.prompts.includes(entry.prompt))).toBe(true)
    }
  })
})
