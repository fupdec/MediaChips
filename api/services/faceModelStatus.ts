import type {ModelStatus} from '../types/mlModels'

/** Shared status shape for cached ORT models (detect / embed / gender / landmarks). */
export function resolveCachedModelStatus(input: {
  modelId: string
  path: string
  sessionLoaded: boolean
  loading: boolean
  lastError: Error | null
  downloaded: boolean
  enabled?: boolean
}): ModelStatus {
  if (input.enabled === false) {
    return {status: 'disabled', model: input.modelId}
  }
  if (input.sessionLoaded) {
    return {status: 'loaded', model: input.modelId, path: input.path}
  }
  if (input.loading) {
    return {status: 'loading', model: input.modelId, path: input.path}
  }
  if (input.lastError) {
    return {
      status: 'error',
      model: input.modelId,
      path: input.path,
      message: input.lastError.message,
    }
  }
  return {
    status: input.downloaded ? 'downloaded' : 'not_downloaded',
    model: input.modelId,
    path: input.path,
  }
}

export type CachedModelPrepEvent<Phase extends string = string> = {
  type: 'status'
  phase: Phase
  message: string
  sizeMb?: number
}

/** NDJSON status while downloading a cached ORT model. */
export function buildCachedModelDownloadEvent<Phase extends string>(input: {
  phase: Phase
  sizeMb: number
  /** e.g. "face detection" → "Downloading face detection model (~N MB)…" */
  kind: string
}): CachedModelPrepEvent<Phase> {
  return {
    type: 'status',
    phase: input.phase,
    message: `Downloading ${input.kind} model (~${input.sizeMb} MB)…`,
    sizeMb: input.sizeMb,
  }
}

/** NDJSON status after a first-time model download completes. */
export function buildCachedModelReadyEvent<Phase extends string>(input: {
  phase: Phase
  sizeMb: number
  /** e.g. "face detection" → "Face detection model downloaded." */
  kind: string
}): CachedModelPrepEvent<Phase> {
  const label = input.kind.charAt(0).toUpperCase() + input.kind.slice(1)
  return {
    type: 'status',
    phase: input.phase,
    message: `${label} model downloaded.`,
    sizeMb: input.sizeMb,
  }
}
