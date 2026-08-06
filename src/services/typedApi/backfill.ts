import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import {parseBackfillStatus} from '@shared/schemas'
import {postApiNdjsonStream} from '../ndjsonStream'
import {validated} from './validate'

export type BackfillKind =
  | 'contentHash'
  | 'oshash'
  | 'fingerprint'
  | 'visualHash'
  | 'clipEmbedding'
  | 'videoCodec'

export type BackfillStatus = {
  total?: number
  pending?: number
  hashed?: number
  filled?: number
  modelStatus?: string
  model?: string
}

export type BackfillStreamEvent = {
  type: string
  processed?: number
  total?: number
  hashed?: number
  updated?: number
  missing?: number
  failed?: number
  skipped?: number
  current?: string
  message?: string
  stopped?: boolean
}

const BACKFILL_ROUTES: Record<BackfillKind, {status: string; stream: string}> = {
  contentHash: {
    status: API_ROUTES.taskContentHashBackfillStatus,
    stream: API_ROUTES.taskStreamContentHashBackfill,
  },
  oshash: {
    status: API_ROUTES.taskOshashBackfillStatus,
    stream: API_ROUTES.taskStreamOshashBackfill,
  },
  fingerprint: {
    status: API_ROUTES.taskFingerprintBackfillStatus,
    stream: API_ROUTES.taskStreamFingerprintBackfill,
  },
  visualHash: {
    status: API_ROUTES.taskVisualHashBackfillStatus,
    stream: API_ROUTES.taskStreamVisualHashBackfill,
  },
  clipEmbedding: {
    status: API_ROUTES.taskClipEmbeddingBackfillStatus,
    stream: API_ROUTES.taskStreamClipEmbeddingBackfill,
  },
  videoCodec: {
    status: API_ROUTES.taskVideoCodecBackfillStatus,
    stream: API_ROUTES.taskStreamVideoCodecBackfill,
  },
}

export const backfillApi = {
  getBackfillStatus(kind: BackfillKind) {
    const route = BACKFILL_ROUTES[kind]
    return apiClient.get(route.status).then((res) => ({
      ...res,
      data: validated(parseBackfillStatus, res.data) as BackfillStatus,
    }))
  },

  streamBackfill(
    kind: BackfillKind,
    options: {force?: boolean; signal?: AbortSignal},
    onEvent: (event: BackfillStreamEvent) => void,
  ) {
    const route = BACKFILL_ROUTES[kind]
    return postApiNdjsonStream(
      route.stream,
      {
        signal: options.signal,
        query: {force: options.force === true},
        errorMessage: `${kind} backfill request failed`,
      },
      onEvent,
    )
  },
}
