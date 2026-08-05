import {API_ROUTES} from '@shared/api/routes'
import {
  fetchApiJson,
  postApiNdjsonStream,
  readNdjsonStream,
} from '@/services/ndjsonStream'

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

export {readNdjsonStream as readLocalAiNdjsonStream}

export async function fetchLocalAiStatus(): Promise<LocalAiStatus> {
  return fetchApiJson<LocalAiStatus>(API_ROUTES.taskLocalAiStatus)
}

export async function setLocalAiEnabled(enabled: boolean): Promise<LocalAiStatus> {
  return fetchApiJson<LocalAiStatus>(API_ROUTES.taskSetLocalAiEnabled, {
    method: 'POST',
    body: {enabled},
  })
}

export async function deleteLocalAiModel(): Promise<{deleted: boolean; status: LocalAiStatus}> {
  return fetchApiJson(API_ROUTES.taskDeleteLocalAi, {
    method: 'POST',
    body: {},
  })
}

export async function streamLocalAiDownload(
  signal: AbortSignal,
  onEvent: (event: LocalAiStreamEvent) => void,
) {
  await postApiNdjsonStream(
    API_ROUTES.taskStreamDownloadLocalAi,
    {signal, errorMessage: 'Local AI download failed'},
    onEvent,
  )
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
  await postApiNdjsonStream(
    API_ROUTES.taskStreamLocalAiChat,
    {body, signal, errorMessage: 'Local AI chat failed'},
    onEvent,
  )
}
