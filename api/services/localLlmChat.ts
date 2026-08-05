import {
  buildFilterAssistPrompt,
  buildMetaAssistPrompt,
  buildRegexAssistPrompt,
} from './localAiAssist'
import type {ModelStatus} from '../types/mlModels'

export type LocalAiChatPromptRequest = {
  mode?: 'chat' | 'regex' | 'filter' | 'meta'
  locale?: string
  context?: Record<string, unknown>
  system?: string
}

export function languageInstruction(locale: string): string {
  const map: Record<string, string> = {
    en: 'English',
    ru: 'Russian',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
    pt: 'Portuguese',
    ja: 'Japanese',
    cn: 'Simplified Chinese',
  }
  const lang = map[locale] || map.en
  return `Reply in ${lang}. If the user writes in another language, reply in that language instead.`
}

export function buildLocalAiSystemPrompt(req: LocalAiChatPromptRequest, docsText: string): string {
  const locale = String(req.locale || 'en')
  const mode = req.mode || 'chat'
  const parts = [
    'You are MediaChips Local AI assistant. Stay local-only: never suggest cloud AI services.',
    languageInstruction(locale),
    'Be concise and practical.',
  ]

  if (docsText) {
    parts.push(
      'Use ONLY the documentation excerpts below for how-to / product questions. If they are insufficient, say you are unsure and suggest opening Documentation.',
      'When you cite a section, mention its id like docs:section.id so the UI can open it.',
      'Documentation excerpts:\n' + docsText,
    )
  }

  if (mode === 'regex') {
    parts.push(...buildRegexAssistPrompt((req.context || {}) as Record<string, unknown>))
  } else if (mode === 'filter') {
    parts.push(...buildFilterAssistPrompt((req.context || {}) as Record<string, unknown>))
  } else if (mode === 'meta') {
    parts.push(...buildMetaAssistPrompt((req.context || {}) as Record<string, unknown>))
  } else {
    parts.push(
      'You can answer product questions from documentation and help with library organization.',
      'Do not invent app features that are not in the documentation excerpts.',
    )
  }

  if (req.system) parts.push(String(req.system))
  return parts.join('\n\n')
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

export function extractDocIds(text: string): string[] {
  const ids = new Set<string>()
  const re = /docs:([a-z0-9_.-]+)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    ids.add(match[1])
  }
  return [...ids]
}

/** Prefer cited docs, then backfill with the first few retrieved docs. */
export function mergeCitedLocalAiDocs<T extends {id: string; title: string}>(
  docs: T[],
  citedIds: string[],
  fallbackLimit = 3,
): Array<{id: string; title: string}> {
  return [
    ...new Map([
      ...docs.filter((d) => citedIds.includes(d.id)).map((d) => [d.id, {id: d.id, title: d.title}] as const),
      ...docs.slice(0, fallbackLimit).map((d) => [d.id, {id: d.id, title: d.title}] as const),
    ]).values(),
  ]
}

export type LocalAiStatusExtras = {
  enabled: boolean
  sizeMb: number
  filename: string
}

/** Pure status for Local AI model load / download state. */
export function resolveLocalAiModelStatus(input: {
  enabled: boolean
  modelId: string
  path: string
  sizeMb: number
  filename: string
  sessionLoaded: boolean
  loading: boolean
  lastError: Error | null
  downloaded: boolean
}): ModelStatus & LocalAiStatusExtras {
  const base = {
    model: input.modelId,
    path: input.path,
    enabled: input.enabled,
    sizeMb: input.sizeMb,
    filename: input.filename,
  }
  if (!input.enabled) {
    return {...base, status: 'disabled'}
  }
  if (input.sessionLoaded) {
    return {...base, status: 'loaded'}
  }
  if (input.loading) {
    return {...base, status: 'loading'}
  }
  if (input.lastError) {
    return {...base, status: 'error', message: input.lastError.message}
  }
  return {
    ...base,
    status: input.downloaded ? 'downloaded' : 'not_downloaded',
  }
}

export function pickLastUserMessageContent(
  messages?: Array<{role: string; content: string}> | null,
): string {
  return [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || ''
}

export function shouldRetrieveLocalAiDocs(mode?: string | null): boolean {
  return !mode || mode === 'chat'
}

export function filterLocalAiChatHistory(
  messages?: Array<{role: string; content: string}> | null,
): Array<{role: 'user' | 'assistant'; content: string}> {
  return (messages || []).filter(
    (m): m is {role: 'user' | 'assistant'; content: string} =>
      m.role === 'user' || m.role === 'assistant',
  )
}

export function resolveLocalAiPromptText(input: {
  history: Array<{role: string; content: string}>
  userText: string
  fallback?: string
}): string {
  const lastUser = input.history.length ? input.history[input.history.length - 1] : null
  return lastUser?.content || input.userText || input.fallback || 'Help me with MediaChips.'
}

export function resolveLocalAiMaxTokens(mode?: string | null): number {
  return mode && mode !== 'chat' ? 640 : 768
}
