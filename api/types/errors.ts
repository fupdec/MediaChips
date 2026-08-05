import type { Response } from 'express'

export function apiErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function apiErrorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined
}

export type ApiErrorLike = {
  code?: string
  required?: unknown
  available?: unknown
  message?: string
}

/** Domain / HTTP errors controllers can throw; mapped by sendControllerError. */
export class HttpError extends Error {
  status: number
  body: Record<string, unknown>

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

const ERROR_RESPONSE_OMIT = new Set(['name', 'message', 'stack', 'status', 'cause', 'body'])

export function httpStatusFromError(err: unknown, fallback = 500): number {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as {status?: unknown}).status
    if (typeof status === 'number' && status >= 400 && status < 600) {
      return status
    }
  }
  return fallback
}

/**
 * Map thrown errors to an HTTP JSON response.
 * Supports HttpError, and duck-typed errors with `.status` (e.g. TagNameConflictError).
 */
/** Successful read / update / action response. */
export function sendOk(res: Response, body?: unknown): Response {
  if (body === undefined) return res.sendStatus(200)
  return res.status(200).send(body)
}

/** Successful create response (new resource). */
export function sendCreated(res: Response, body?: unknown): Response {
  if (body === undefined) return res.sendStatus(201)
  return res.status(201).send(body)
}

export function sendControllerError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
): Response {
  const message = apiErrorMessage(err) || fallbackMessage

  if (err instanceof HttpError) {
    return res.status(err.status).send({
      message: err.message || fallbackMessage,
      ...err.body,
    })
  }

  const status = httpStatusFromError(err)
  if (status !== 500 && err && typeof err === 'object') {
    const extra: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(err as Record<string, unknown>)) {
      if (!ERROR_RESPONSE_OMIT.has(key) && value !== undefined) {
        extra[key] = value
      }
    }
    return res.status(status).send({message, ...extra})
  }

  return res.status(500).send({message})
}

/** Validation / client-input rejection. */
export function sendBadRequest(
  res: Response,
  message: string,
  body: Record<string, unknown> = {},
): Response {
  return sendControllerError(res, new HttpError(400, message, body), message)
}

/** Missing resource rejection. */
export function sendNotFound(
  res: Response,
  message: string,
  body: Record<string, unknown> = {},
): Response {
  return sendControllerError(res, new HttpError(404, message, body), message)
}

/**
 * Task/IO handlers historically map unexpected failures to 400.
 * Preserves HttpError status; wraps plain errors as HttpError(400).
 */
export function sendAsClientError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
): Response {
  if (err instanceof HttpError) {
    return sendControllerError(res, err, fallbackMessage)
  }
  return sendControllerError(
    res,
    new HttpError(400, apiErrorMessage(err) || fallbackMessage),
    fallbackMessage,
  )
}

export function asApiError(error: unknown): ApiErrorLike & { message: string } {
  if (error && typeof error === 'object') {
    const record = error as ApiErrorLike
    return {
      code: record.code || errnoCode(error) || 'UNKNOWN',
      required: record.required,
      available: record.available,
      message: record.message || apiErrorMessage(error),
    }
  }
  return { message: apiErrorMessage(error), code: 'UNKNOWN' }
}

function errnoCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as {code?: unknown}).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}
