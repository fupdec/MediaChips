import {describe, expect, it} from 'vitest'
import {
  buildLocalAiSystemPrompt,
  extractDocIds,
  extractJsonObject,
  languageInstruction,
  mergeCitedLocalAiDocs,
} from './localLlmChat'

describe('localLlmChat', () => {
  it('maps locales to reply-language instructions', () => {
    expect(languageInstruction('ru')).toContain('Russian')
    expect(languageInstruction('zz')).toContain('English')
  })

  it('builds chat and mode system prompts', () => {
    const chat = buildLocalAiSystemPrompt({mode: 'chat', locale: 'en'}, 'docs:intro')
    expect(chat).toContain('Documentation excerpts')
    expect(chat).toContain('docs:intro')
    expect(chat).toContain('library organization')

    const regex = buildLocalAiSystemPrompt({
      mode: 'regex',
      context: {sample: '/Shows/Ada/ep.mkv'},
      system: 'Extra',
    }, '')
    expect(regex).toContain('Extra')
    expect(regex.toLowerCase()).toMatch(/regex|pattern/)
  })

  it('extracts JSON objects and doc ids from model text', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({a: 1})
    expect(extractJsonObject('prefix {"b":2} suffix')).toEqual({b: 2})
    expect(extractJsonObject('nope')).toBeNull()
    expect(extractDocIds('See docs:getting.started and docs:filters')).toEqual([
      'getting.started',
      'filters',
    ])
  })

  it('merges cited docs ahead of fallback retrieval', () => {
    const docs = [
      {id: 'a', title: 'A'},
      {id: 'b', title: 'B'},
      {id: 'c', title: 'C'},
      {id: 'd', title: 'D'},
    ]
    expect(mergeCitedLocalAiDocs(docs, ['c'], 2)).toEqual([
      {id: 'c', title: 'C'},
      {id: 'a', title: 'A'},
      {id: 'b', title: 'B'},
    ])
  })
})
