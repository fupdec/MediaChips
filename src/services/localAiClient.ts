import {buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {API_ROUTES} from '@shared/api/routes'

export type LocalAiStatus = {
  status: string
  model?: string
  path?: string
  message?: string
  enabled?: boolean
  sizeMb?: number
  filename?: string
}

export type LocalAiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LocalAiStreamEvent = {
  type: string
  text?: string
  message?: string
  percent?: number
  phase?: string
  docs?: Array<{id: string; title: string}>
  parsed?: Record<string, unknown> | null
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  needsConfirmation?: boolean
  result?: unknown
  ok?: boolean
}

function buildRequestHeaders(withJson = false) {
  const token = getAuthToken()
  return {
    ...(withJson ? {'Content-Type': 'application/json'} : {}),
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  }
}

export async function readLocalAiNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: LocalAiStreamEvent) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const {value, done} = await reader.read()
    if (done) break

    buffer += decoder.decode(value, {stream: true})
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      onEvent(JSON.parse(line) as LocalAiStreamEvent)
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as LocalAiStreamEvent)
  }
}

export async function fetchLocalAiStatus(): Promise<LocalAiStatus> {
  const response = await fetch(buildApiUrl(API_ROUTES.taskLocalAiStatus), {
    headers: buildRequestHeaders(),
  })
  if (!response.ok) throw new Error(response.statusText || 'Local AI status failed')
  return response.json()
}

export async function setLocalAiEnabled(enabled: boolean): Promise<LocalAiStatus> {
  const response = await fetch(buildApiUrl(API_ROUTES.taskSetLocalAiEnabled), {
    method: 'POST',
    headers: buildRequestHeaders(true),
    body: JSON.stringify({enabled}),
  })
  if (!response.ok) throw new Error(response.statusText || 'Failed to update Local AI')
  return response.json()
}

export async function deleteLocalAiModel(): Promise<{deleted: boolean; status: LocalAiStatus}> {
  const response = await fetch(buildApiUrl(API_ROUTES.taskDeleteLocalAi), {
    method: 'POST',
    headers: buildRequestHeaders(true),
    body: JSON.stringify({}),
  })
  if (!response.ok) throw new Error(response.statusText || 'Failed to delete Local AI model')
  return response.json()
}

export async function streamLocalAiDownload(
  signal: AbortSignal,
  onEvent: (event: LocalAiStreamEvent) => void,
) {
  const response = await fetch(buildApiUrl(API_ROUTES.taskStreamDownloadLocalAi), {
    method: 'POST',
    headers: buildRequestHeaders(true),
    signal,
    body: JSON.stringify({}),
  })
  if (!response.ok || !response.body) {
    throw new Error(response.statusText || 'Local AI download failed')
  }
  await readLocalAiNdjsonStream(response.body, onEvent)
}

export async function streamLocalAiChat(
  body: {
    mode?: string
    locale?: string
    messages?: LocalAiChatMessage[]
    context?: Record<string, unknown>
    system?: string
    toolCall?: Record<string, unknown>
    confirmTool?: boolean
  },
  signal: AbortSignal,
  onEvent: (event: LocalAiStreamEvent) => void,
) {
  const response = await fetch(buildApiUrl(API_ROUTES.taskStreamLocalAiChat), {
    method: 'POST',
    headers: buildRequestHeaders(true),
    signal,
    body: JSON.stringify(body),
  })
  if (!response.ok || !response.body) {
    throw new Error(response.statusText || 'Local AI chat failed')
  }
  await readLocalAiNdjsonStream(response.body, onEvent)
}
