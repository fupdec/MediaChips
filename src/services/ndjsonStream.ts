import {buildApiUrl} from './apiClient'
import {getAuthToken} from './authSession'

export class ApiHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
  }
}

export function buildApiRequestHeaders(withJson = false): Record<string, string> {
  const token = getAuthToken()
  return {
    ...(withJson ? {'Content-Type': 'application/json'} : {}),
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  }
}

function withQuery(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export async function readNdjsonStream<T = unknown>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
  options: {ignoreMalformed?: boolean} = {},
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const emitLine = (line: string) => {
    if (!line.trim()) return
    try {
      onEvent(JSON.parse(line) as T)
    } catch (error) {
      if (options.ignoreMalformed) return
      throw error
    }
  }

  while (true) {
    const {value, done} = await reader.read()
    if (done) break

    buffer += decoder.decode(value, {stream: true})
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) emitLine(line)
  }

  emitLine(buffer)
}

export async function fetchApiJson<T = unknown>(
  path: string,
  options: {
    method?: string
    body?: unknown
    signal?: AbortSignal
    query?: Record<string, string | number | boolean | undefined | null>
  } = {},
): Promise<T> {
  const method = options.method || (options.body !== undefined ? 'POST' : 'GET')
  const withJson = options.body !== undefined || method !== 'GET'
  const response = await fetch(buildApiUrl(withQuery(path, options.query)), {
    method,
    headers: buildApiRequestHeaders(withJson),
    signal: options.signal,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw new ApiHttpError(response.status, response.statusText || 'Request failed')
  }

  return response.json() as Promise<T>
}

export async function postApiNdjsonStream<T = unknown>(
  path: string,
  options: {
    body?: unknown
    signal?: AbortSignal
    query?: Record<string, string | number | boolean | undefined | null>
    ignoreMalformed?: boolean
    errorMessage?: string
  },
  onEvent: (event: T) => void,
) {
  const response = await fetch(buildApiUrl(withQuery(path, options.query)), {
    method: 'POST',
    headers: buildApiRequestHeaders(true),
    signal: options.signal,
    body: JSON.stringify(options.body ?? {}),
  })

  if (!response.ok || !response.body) {
    throw new ApiHttpError(
      response.status,
      response.statusText || options.errorMessage || 'Stream request failed',
    )
  }

  await readNdjsonStream(response.body, onEvent, {
    ignoreMalformed: options.ignoreMalformed,
  })
}
