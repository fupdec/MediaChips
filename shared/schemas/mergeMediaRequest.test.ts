import {describe, expect, it} from 'vitest'
import {MergeMediaRequestSchema} from './requests'

describe('MergeMediaRequestSchema', () => {
  it('keeps the options the merge dialog sends: the validator replaces the request body with the parsed result', () => {
    const body = {survivorId: 1, sourceIds: [2, 3], with_file: false, similarity: true, trustUnavailable: true}
    expect(MergeMediaRequestSchema.parse(body)).toEqual(body)
  })
})
