import {
  buildFilterAssistPrompt,
  buildMetaAssistPrompt,
  buildRegexAssistPrompt,
} from './localAiAssist'
import {buildSearchAssistPrompt} from './localAiSearchAssist'
import type {ModelStatus} from '../types/mlModels'

export type LocalAiChatPromptRequest = {
  mode?: 'chat' | 'regex' | 'filter' | 'meta' | 'search'
  locale?: string
  context?: Record<string, unknown>
  system?: string
}

export const APP_UI_LOCALES = ['en', 'ru', 'cn', 'de', 'es', 'fr', 'ja', 'pt'] as const
export type AppUiLocale = (typeof APP_UI_LOCALES)[number]

const LOCALE_LANGUAGE_NAMES: Record<AppUiLocale, string> = {
  en: 'English',
  ru: 'Russian',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  ja: 'Japanese',
  cn: 'Simplified Chinese',
}

/** Normalize MediaChips UI locale codes (zh-Hans → cn, pt-BR → pt, …). */
export function normalizeAppUiLocale(locale?: string | null): AppUiLocale {
  const raw = String(locale || 'en').trim().toLowerCase().replace(/_/g, '-')
  if (!raw) return 'en'
  if (raw === 'cn' || raw === 'zh' || raw.startsWith('zh-')) return 'cn'
  const base = raw.split('-')[0]
  if ((APP_UI_LOCALES as readonly string[]).includes(base)) return base as AppUiLocale
  return 'en'
}

export function languageDisplayName(locale?: string | null): string {
  return LOCALE_LANGUAGE_NAMES[normalizeAppUiLocale(locale)]
}

export function languageInstruction(locale: string): string {
  const code = normalizeAppUiLocale(locale)
  const lang = languageDisplayName(code)
  return [
    `UI language code: ${code}.`,
    `ALWAYS reply in ${lang}.`,
    `Write the full assistant message in ${lang}, including explanations and summaries.`,
    `If documentation excerpts are in English or another language, translate the answer into ${lang}.`,
    `Do not answer in English unless the UI language is English.`,
    `For JSON assist modes, keep machine keys in English, but put human-readable summary/explanation text in ${lang}.`,
  ].join(' ')
}

export function buildLocalAiSystemPrompt(req: LocalAiChatPromptRequest, docsText: string): string {
  const locale = normalizeAppUiLocale(req.locale)
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
      `Answer the user in ${languageDisplayName(locale)} even when excerpts differ in language.`,
      'Documentation excerpts:\n' + docsText,
    )
  }

  if (mode === 'regex') {
    parts.push(...buildRegexAssistPrompt((req.context || {}) as Record<string, unknown>))
  } else if (mode === 'filter') {
    parts.push(...buildFilterAssistPrompt((req.context || {}) as Record<string, unknown>))
  } else if (mode === 'meta') {
    parts.push(...buildMetaAssistPrompt((req.context || {}) as Record<string, unknown>))
  } else if (mode === 'search') {
    parts.push(...buildSearchAssistPrompt((req.context || {}) as Record<string, unknown>))
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
  /** True when the GGUF file is present on disk (even if Local AI is disabled). */
  downloaded?: boolean
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
    return {
      ...base,
      status: 'disabled',
      downloaded: input.downloaded,
    }
  }
  if (input.sessionLoaded) {
    return {...base, status: 'loaded', downloaded: true}
  }
  if (input.loading) {
    return {...base, status: 'loading', downloaded: input.downloaded}
  }
  if (input.lastError) {
    return {
      ...base,
      status: 'error',
      message: input.lastError.message,
      downloaded: input.downloaded,
    }
  }
  return {
    ...base,
    status: input.downloaded ? 'downloaded' : 'not_downloaded',
    downloaded: input.downloaded,
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
