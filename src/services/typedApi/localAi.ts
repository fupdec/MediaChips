import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import {
  parseLocalAiDeleteResponse,
  parseLocalAiStatus,
} from '@shared/schemas'
import {
  LocalAiChatRequestSchema,
  LocalAiSetEnabledRequestSchema,
} from '@shared/schemas/localAi'
import {postApiNdjsonStream} from '../ndjsonStream'
import {validated, validateRequest} from './validate'

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

export type LocalAiChatBody = {
  mode?: string
  locale?: string
  messages?: LocalAiChatMessage[]
  context?: Record<string, unknown>
  system?: string
  toolCall?: Record<string, unknown>
  confirmTool?: boolean
}

export const localAiApi = {
  getLocalAiStatus() {
    return apiClient.get(API_ROUTES.taskLocalAiStatus).then((res) => {
      const data = validated(parseLocalAiStatus, res.data) as LocalAiStatus
      return {...res, data}
    })
  },

  setLocalAiEnabled(enabled: boolean) {
    const body = validateRequest(LocalAiSetEnabledRequestSchema, {enabled})
    return apiClient.post(API_ROUTES.taskSetLocalAiEnabled, body).then((res) => {
      const data = validated(parseLocalAiStatus, res.data) as LocalAiStatus
      return {...res, data}
    })
  },

  deleteLocalAiModel() {
    return apiClient.post(API_ROUTES.taskDeleteLocalAi, {}).then((res) => {
      const data = validated(parseLocalAiDeleteResponse, res.data) as {
        deleted: boolean
        status: LocalAiStatus
      }
      return {...res, data}
    })
  },

  streamLocalAiDownload(
    signal: AbortSignal,
    onEvent: (event: LocalAiStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamDownloadLocalAi,
      {signal, errorMessage: 'Local AI download failed'},
      onEvent,
    )
  },

  streamLocalAiChat(
    body: LocalAiChatBody,
    signal: AbortSignal,
    onEvent: (event: LocalAiStreamEvent) => void,
  ) {
    const validatedBody = validateRequest(LocalAiChatRequestSchema, body)
    return postApiNdjsonStream(
      API_ROUTES.taskStreamLocalAiChat,
      {body: validatedBody, signal, errorMessage: 'Local AI chat failed'},
      onEvent,
    )
  },
}
