export class NasError extends Error {
  constructor(public code: string, message: string, public status = 422, public fingerprint?: string) {
    super(message)
  }
}
