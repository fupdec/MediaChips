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
  },
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
    expect(detectSemanticQueryLang('girl and машина')).toBe('ru')
  })

  it('detects Chinese via CJK', () => {
    expect(looksEnglish('红色的汽车')).toBe(false)
    expect(detectSemanticQueryLang('戴帽子的女人')).toBe('zh')
    expect(detectSemanticQueryLang('woman 帽子')).toBe('zh')
  })

  it('detects Spanish via markers', () => {
    expect(looksEnglish('niño en la playa')).toBe(false)
    expect(detectSemanticQueryLang('¿dónde está el coche?')).toBe('es')
    expect(detectSemanticQueryLang('niño en la playa')).toBe('es')
  })

  it('uses es locale for ambiguous Latin without markers', () => {
    expect(detectSemanticQueryLang('mujer en la playa', 'en')).toBe('es')
    expect(detectSemanticQueryLang('mujer en la playa', 'es')).toBe('es')
    expect(detectSemanticQueryLang('woman wearing a hat', 'es')).toBe('en')
    expect(detectSemanticQueryLang('xyzzy plugh', 'es')).toBe('es')
    expect(detectSemanticQueryLang('xyzzy plugh', 'en')).toBe('en')
  })

  it('returns null for empty or unsupported scripts', () => {
    expect(detectSemanticQueryLang('')).toBe(null)
    expect(detectSemanticQueryLang('   ')).toBe(null)
    // Japanese hiragana is in the CJK range we include for MVP.
    expect(detectSemanticQueryLang('こんにちは')).toBe('zh')
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

  it('translates Russian via Opus mock', async () => {
    const result = await translateQueryToEnglish({} as never, 'красная машина')
    expect(result.translated).toBe(true)
    expect(result.sourceLang).toBe('ru')
    expect(result.query).toBe('en:красная машина')
    expect(result.model).toBe('Xenova/opus-mt-ru-en')
  })
})
