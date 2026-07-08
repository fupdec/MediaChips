import { z } from 'zod'

export const coercedBooleanSchema = z.union([
  z.boolean(),
  z.number(),
  z.null(),
  z.enum(['0', '1', 'true', 'false', 'TRUE', 'FALSE']),
]).transform((value) => (
  value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE'
))

export const optionalCoercedBooleanSchema = coercedBooleanSchema.optional()

export const coercedNumberSchema = z.coerce.number()

export const optionalCoercedNumberSchema = coercedNumberSchema.optional()

export const nullableCoercedNumberSchema = z.coerce.number().nullable()

export const optionalNullableCoercedNumberSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.coerce.number().optional(),
)

export const nullableStringSchema = z.string().nullable()

export const optionalNullableStringSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional(),
)

export function isMetaTruthyValue(value: unknown): boolean {
  return value === true
    || value === 1
    || value === '1'
    || value === 'true'
    || value === 'TRUE'
}

export function parseMetaBooleanValue(value: unknown): boolean {
  return isMetaTruthyValue(value)
}

export function serializeMetaBooleanValue(value: unknown): string {
  return parseMetaBooleanValue(value) ? 'true' : 'false'
}

export function serializeMetaValueForStorage(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return serializeMetaBooleanValue(value)
  return String(value)
}
