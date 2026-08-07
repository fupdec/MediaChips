import {describe, expect, it} from 'vitest'
import {
  buildLocalAiSystemPrompt,
  extractDocIds,
  extractJsonObject,
  filterLocalAiChatHistory,
  languageInstruction,
  mergeCitedLocalAiDocs,
  normalizeAppUiLocale,
  pickLastUserMessageContent,
  resolveLocalAiMaxTokens,
  resolveLocalAiModelStatus,
  resolveLocalAiPromptText,
  shouldRetrieveLocalAiDocs,
} from './localLlmChat'

describe('localLlmChat', () => {
  it('maps locales to reply-language instructions', () => {
    expect(languageInstruction('ru')).toContain('Russian')
    expect(languageInstruction('zh-Hans')).toContain('Simplified Chinese')
    expect(languageInstruction('pt-BR')).toContain('Portuguese')
    expect(languageInstruction('zz')).toContain('English')
    expect(languageInstruction('ru')).toContain('ALWAYS reply')
  })

  it('normalizes app UI locales', () => {
    expect(normalizeAppUiLocale('zh-CN')).toBe('cn')
    expect(normalizeAppUiLocale('PT-br')).toBe('pt')
    expect(normalizeAppUiLocale('ja')).toBe('ja')
    expect(normalizeAppUiLocale('nope')).toBe('en')
  })

  it('builds chat and mode system prompts', () => {
    const chat = buildLocalAiSystemPrompt({mode: 'chat', locale: 'ru'}, 'docs:intro')
    expect(chat).toContain('Documentation excerpts')
    expect(chat).toContain('docs:intro')
    expect(chat).toContain('library organization')
    expect(chat).toContain('Russian')
    expect(chat).toContain('Answer the user in Russian')

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

  it('resolves local AI model status states', () => {
    const base = {
      enabled: true,
      modelId: 'm',
      path: '/cache',
      sizeMb: 1,
      filename: 'm.gguf',
      sessionLoaded: false,
      loading: false,
      lastError: null as Error | null,
      downloaded: false,
    }
    expect(resolveLocalAiModelStatus({...base, enabled: false}).status).toBe('disabled')
    expect(resolveLocalAiModelStatus({
      ...base,
      enabled: false,
      downloaded: true,
    })).toMatchObject({status: 'disabled', downloaded: true, enabled: false})
    expect(resolveLocalAiModelStatus({...base, sessionLoaded: true}).status).toBe('loaded')
    expect(resolveLocalAiModelStatus({...base, loading: true}).status).toBe('loading')
    expect(resolveLocalAiModelStatus({
      ...base,
      lastError: new Error('boom'),
    })).toMatchObject({status: 'error', message: 'boom'})
    expect(resolveLocalAiModelStatus({...base, downloaded: true}).status).toBe('downloaded')
    expect(resolveLocalAiModelStatus(base).status).toBe('not_downloaded')
  })

  it('shapes chat request prep helpers', () => {
    expect(pickLastUserMessageContent([
      {role: 'assistant', content: 'hi'},
      {role: 'user', content: 'help'},
      {role: 'system', content: 'x'},
    ])).toBe('help')
    expect(shouldRetrieveLocalAiDocs('chat')).toBe(true)
    expect(shouldRetrieveLocalAiDocs('regex')).toBe(false)
    expect(filterLocalAiChatHistory([
      {role: 'system', content: 's'},
      {role: 'user', content: 'u'},
      {role: 'assistant', content: 'a'},
    ])).toEqual([
      {role: 'user', content: 'u'},
      {role: 'assistant', content: 'a'},
    ])
    expect(resolveLocalAiPromptText({
      history: [{role: 'user', content: 'last'}],
      userText: 'earlier',
    })).toBe('last')
    expect(resolveLocalAiPromptText({history: [], userText: ''})).toBe('Help me with MediaChips.')
    expect(resolveLocalAiMaxTokens('chat')).toBe(768)
    expect(resolveLocalAiMaxTokens('filter')).toBe(640)
  })
})
