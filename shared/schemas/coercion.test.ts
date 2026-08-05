import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  coercedBooleanSchema,
  nullableCoercedNumberSchema,
  optionalCoercedNumberSchema,
  parseMetaBooleanValue,
  serializeMetaBooleanValue,
  serializeMetaValueForStorage,
} from './coercion'

describe('schema coercion helpers', () => {
  it('coerces sqlite-style booleans', () => {
    expect(coercedBooleanSchema.parse(1)).toBe(true)
    expect(coercedBooleanSchema.parse(0)).toBe(false)
    expect(coercedBooleanSchema.parse('true')).toBe(true)
    expect(coercedBooleanSchema.parse(null)).toBe(false)
  })

  it('coerces numeric strings', () => {
    expect(optionalCoercedNumberSchema.parse('12')).toBe(12)
    expect(nullableCoercedNumberSchema.parse(null)).toBeNull()
  })

  it('rejects invalid numbers', () => {
    expect(() => optionalCoercedNumberSchema.parse('abc')).toThrow(z.ZodError)
  })

  it('accepts flat and legacy wrapped TagsInMedia createOne bodies', async () => {
    const {TagsInMediaCreateOneRequestSchema} = await import('./requests')
    expect(TagsInMediaCreateOneRequestSchema.parse({
      mediaId: '10',
      tagId: 2,
      metaId: 3,
    })).toEqual({mediaId: 10, tagId: 2, metaId: 3})
    expect(TagsInMediaCreateOneRequestSchema.parse({
      data: {mediaId: 10, tagId: 2, metaId: 3},
    })).toEqual({mediaId: 10, tagId: 2, metaId: 3})
  })

  it('parses stored meta checkbox values', () => {
    expect(parseMetaBooleanValue(true)).toBe(true)
    expect(parseMetaBooleanValue('true')).toBe(true)
    expect(parseMetaBooleanValue('1')).toBe(true)
    expect(parseMetaBooleanValue(1)).toBe(true)
    expect(parseMetaBooleanValue('false')).toBe(false)
    expect(parseMetaBooleanValue(false)).toBe(false)
    expect(parseMetaBooleanValue(null)).toBe(false)
  })

  it('serializes meta checkbox values for sqlite storage', () => {
    expect(serializeMetaBooleanValue(true)).toBe('true')
    expect(serializeMetaBooleanValue(false)).toBe('false')
    expect(serializeMetaValueForStorage(true)).toBe('true')
    expect(serializeMetaValueForStorage(false)).toBe('false')
    expect(serializeMetaValueForStorage(null)).toBeNull()
  })
})
