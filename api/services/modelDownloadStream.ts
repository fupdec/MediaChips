import type {ApiDb} from '../types/db'
import type {ModelStatus} from '../types/mlModels'
import {apiErrorMessage} from '../types/errors'

export type ModelDownloadStreamEvent = {
  type: 'status' | 'done' | 'error' | 'aborted'
  phase?: string
  message?: string
  percent?: number
  loaded?: number
  total?: number | null
  etaSeconds?: number | null
  sizeMb?: number
  parsed?: {status: ModelStatus}
}

/**
 * Run a prepare* generator then emit `{type:'done', parsed:{status}}`.
 * Used by dedicated model download NDJSON endpoints.
 */
export async function* iteratePreparedModelDownload(
  prepare: (db: ApiDb, options: {shouldStop?: () => boolean}) => AsyncGenerator<{
    type: string
    phase?: string
    message?: string
    percent?: number
    loaded?: number
    total?: number | null
    etaSeconds?: number | null
    sizeMb?: number
  }>,
  getStatus: (db: ApiDb) => ModelStatus,
  db: ApiDb,
  options: {shouldStop?: () => boolean} = {},
): AsyncGenerator<ModelDownloadStreamEvent> {
  try {
    for await (const event of prepare(db, options)) {
      if (options.shouldStop?.()) {
        yield {type: 'aborted'}
        return
      }
      yield event as ModelDownloadStreamEvent
    }
    yield {
      type: 'done',
      percent: 100,
      parsed: {status: getStatus(db)},
    }
  } catch (error: unknown) {
    const message = apiErrorMessage(error) || (error instanceof Error ? error.message : String(error))
    if (message === 'aborted' || options.shouldStop?.()) {
      yield {type: 'aborted'}
      return
    }
    yield {type: 'error', message}
  }
}
