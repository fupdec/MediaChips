import {sourceFailure} from '../../../shared/sourceErrors'
export class NasError extends Error {
  constructor(public code: string, message: string, public status = 422, public fingerprint?: string) {
    super(message)
  }
}

/** Preserve transport distinctions without sending credential-bearing errors. */
export function normalizeNasError(error: unknown): NasError {
  if (error instanceof NasError) return error
  const code = sourceFailure(error)
  if (code === 'auth_required') return new NasError(code, 'NAS sign-in is required. Update the credentials and reconnect.', 409)
  if (code === 'permission_denied') return new NasError(code, 'This NAS account does not have permission to read the folder.', 403)
  if (code === 'network_error') return new NasError(code, 'The NAS server could not be reached. Check the network and server address.', 502)
  return new NasError('connection_failed', 'The NAS request failed. Check the server configuration and try again.', 502)
}
