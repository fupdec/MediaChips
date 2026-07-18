import { computeOshashForPath } from './oshash'

type FingerprintKind = 'oshash'
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
  patch: {oshash: string}
}

function resolveFingerprintKind(
  _mediaType: MediaTypeLike,
  filesize: number,
): FingerprintKind | null {
  const size = Number(filesize) || 0
  if (size <= 8) return null
  return 'oshash'
}

function getFingerprintValue(
  kind: FingerprintKind,
  fields: FingerprintFields,
): string {
  if (kind === 'oshash') {
    return String(fields.oshash || '').trim()
  }
  return ''
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
  return {oshash: value}
}

async function computeFingerprint(input: FingerprintMediaInput): Promise<ComputedFingerprint | null> {
  const kind = resolveFingerprintKind(input.mediaType, input.filesize)
  if (!kind) return null

  const value = await computeOshashForPath(input.path)

  return {
    kind,
    value,
    patch: fingerprintPatch(kind, value),
  }
}

function duplicateParameterForKind(_kind: FingerprintKind): 'oshash' {
  return 'oshash'
}

export {
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
