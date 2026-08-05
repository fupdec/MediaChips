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
