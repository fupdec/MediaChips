import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { sendControllerError } from '../types/errors'

type MaybeAsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>

/**
 * Wrap sync/async route handlers so thrown errors become JSON error responses
 * instead of unhandled rejections / Express default HTML errors.
 */
export function asyncHandler(
  fn: MaybeAsyncRequestHandler,
  fallbackMessage = 'Some error occurred while performing query.',
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
      if (res.headersSent) {
        next(err)
        return
      }
      sendControllerError(res, err, fallbackMessage)
    })
  }
}
