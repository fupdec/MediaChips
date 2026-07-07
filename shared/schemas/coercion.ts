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

export const optionalNullableCoercedNumberSchema = nullableCoercedNumberSchema.optional()

export const nullableStringSchema = z.string().nullable()

export const optionalNullableStringSchema = nullableStringSchema.optional()
