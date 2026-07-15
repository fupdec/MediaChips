import { computeContentHashForPath } from './contentHash'
import { computeOshashForPath } from './oshash'

/** Non-video files larger than this use oshash instead of full-file sha256. */
const FINGERPRINT_SIZE_THRESHOLD_BYTES = 32 * 1024 * 1024

type FingerprintKind = 'oshash' | 'contentHash'
type MediaTypeLike = string | null | undefined

type FingerprintFields = {
  oshash?: string | null
  contentHash?: string | null
}

type FingerprintMediaInput = {
  path: string
  filesize: number
  mediaType: MediaTypeLike
}

type ComputedFingerprint = {
  kind: FingerprintKind
  value: string
  patch: {oshash: string} | {contentHash: string}
}

function normalizeMediaType(mediaType: MediaTypeLike): string {
  return String(mediaType || '').trim().toLowerCase()
}

function resolveFingerprintKind(
  mediaType: MediaTypeLike,
  filesize: number,
): FingerprintKind | null {
  const size = Number(filesize) || 0
  const type = normalizeMediaType(mediaType)

  if (type === 'video') {
    if (size <= 8) return null
    return 'oshash'
  }

  if (size <= 0) return null

  if (size > FINGERPRINT_SIZE_THRESHOLD_BYTES) {
    if (size <= 8) return null
    return 'oshash'
  }

  return 'contentHash'
}

function getFingerprintValue(
  kind: FingerprintKind,
  fields: FingerprintFields,
): string {
  if (kind === 'oshash') {
    return String(fields.oshash || '').trim()
  }
  return String(fields.contentHash || '').trim()
}

function isFingerprintFilled(
  mediaType: MediaTypeLike,
  filesize: number,
  fields: FingerprintFields,
): boolean {
  const kind = resolveFingerprintKind(mediaType, filesize)
  if (!kind) return true
  return Boolean(getFingerprintValue(kind, fields))
}

function fingerprintPatch(kind: FingerprintKind, value: string): ComputedFingerprint['patch'] {
  if (kind === 'oshash') {
    return {oshash: value}
  }
  return {contentHash: value}
}

async function computeFingerprint(input: FingerprintMediaInput): Promise<ComputedFingerprint | null> {
  const kind = resolveFingerprintKind(input.mediaType, input.filesize)
  if (!kind) return null

  const value = kind === 'oshash'
    ? await computeOshashForPath(input.path)
    : await computeContentHashForPath(input.path)

  return {
    kind,
    value,
    patch: fingerprintPatch(kind, value),
  }
}

function duplicateParameterForKind(kind: FingerprintKind): 'oshash' | 'content_hash' {
  return kind === 'oshash' ? 'oshash' : 'content_hash'
}

export {
  FINGERPRINT_SIZE_THRESHOLD_BYTES,
  resolveFingerprintKind,
  getFingerprintValue,
  isFingerprintFilled,
  fingerprintPatch,
  computeFingerprint,
  duplicateParameterForKind,
}

export type {
  FingerprintKind,
  FingerprintFields,
  FingerprintMediaInput,
  ComputedFingerprint,
}
