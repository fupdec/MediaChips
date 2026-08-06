import {describe, expect, it, vi} from 'vitest'
import {
  detectSemanticQueryLang,
  looksEnglish,
  translateQueryToEnglish,
} from './semanticQueryTranslate'

vi.mock('./opusMtTranslate', () => ({
  OPUS_MT_MODELS: {
    ru: 'Xenova/opus-mt-ru-en',
    zh: 'Xenova/opus-mt-zh-en',
    es: 'Xenova/opus-mt-es-en',
    de: 'Xenova/opus-mt-de-en',
    fr: 'Xenova/opus-mt-fr-en',
    ja: 'Xenova/opus-mt-ja-en',
    pt: 'Xenova/opus-mt-pt-en',
  },
  hasDownloadedOpusModel: vi.fn(() => true),
  prefetchOpusMtModel: vi.fn(),
  translateWithOpusMt: vi.fn(async (_db: unknown, lang: string, text: string) => ({
    text: `en:${text}`,
    model: `Xenova/opus-mt-${lang}-en`,
  })),
}))

describe('semanticQueryTranslate detect', () => {
  it('detects English queries', () => {
    expect(looksEnglish('red sports car on a beach')).toBe(true)
    expect(detectSemanticQueryLang('woman wearing a hat')).toBe('en')
  })

  it('detects Russian via Cyrillic', () => {
    expect(looksEnglish('красная машина')).toBe(false)
    expect(detectSemanticQueryLang('девушка в шляпе')).toBe('ru')
  })

  it('detects Chinese via Han and Japanese via kana', () => {
    expect(detectSemanticQueryLang('戴帽子的女人')).toBe('zh')
    expect(detectSemanticQueryLang('戴帽子的女人', 'ja')).toBe('ja')
    expect(detectSemanticQueryLang('こんにちは')).toBe('ja')
    expect(detectSemanticQueryLang('女の人')).toBe('ja')
  })

  it('detects Spanish via markers and hints', () => {
    expect(detectSemanticQueryLang('¿dónde está el coche?')).toBe('es')
    expect(detectSemanticQueryLang('niño en la playa')).toBe('es')
  })

  it('detects German, French, and Portuguese', () => {
    expect(detectSemanticQueryLang('Straße am Strand')).toBe('de')
    expect(detectSemanticQueryLang('große Straße')).toBe('de')
    expect(detectSemanticQueryLang('femme sur la plage')).toBe('fr')
    expect(detectSemanticQueryLang('mulher na praia')).toBe('pt')
    expect(detectSemanticQueryLang('não está na praia')).toBe('pt')
  })

  it('uses app locale for ambiguous Latin', () => {
    expect(detectSemanticQueryLang('xyzzy plugh', 'de')).toBe('de')
    expect(detectSemanticQueryLang('xyzzy plugh', 'fr')).toBe('fr')
    expect(detectSemanticQueryLang('xyzzy plugh', 'pt')).toBe('pt')
    expect(detectSemanticQueryLang('xyzzy plugh', 'es')).toBe('es')
    expect(detectSemanticQueryLang('xyzzy plugh', 'en')).toBe('en')
    expect(detectSemanticQueryLang('woman wearing a hat', 'de')).toBe('en')
  })

  it('returns null for empty input', () => {
    expect(detectSemanticQueryLang('')).toBe(null)
    expect(detectSemanticQueryLang('   ')).toBe(null)
  })
})

describe('translateQueryToEnglish', () => {
  it('skips translation for English', async () => {
    const result = await translateQueryToEnglish({} as never, 'woman wearing a hat')
    expect(result).toMatchObject({
      query: 'woman wearing a hat',
      translated: false,
      sourceLang: 'en',
      model: null,
    })
  })

  it('translates supported languages via Opus mock', async () => {
    const ru = await translateQueryToEnglish({} as never, 'красная машина')
    expect(ru).toMatchObject({translated: true, sourceLang: 'ru', model: 'Xenova/opus-mt-ru-en'})

    const de = await translateQueryToEnglish({} as never, 'Frau am Strand')
    expect(de).toMatchObject({translated: true, sourceLang: 'de', model: 'Xenova/opus-mt-de-en'})

    const ja = await translateQueryToEnglish({} as never, 'こんにちは')
    expect(ja).toMatchObject({translated: true, sourceLang: 'ja', model: 'Xenova/opus-mt-ja-en'})
  })
})
