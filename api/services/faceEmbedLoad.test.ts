/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { embeddingToJson } from './faceMatchScoring'
import { resolveFaceEmbedding } from './faceEmbedLoad'

describe('resolveFaceEmbedding', () => {
  it('returns stored embedding without touching crop/embed', async () => {
    const embedding = new Float32Array([1, 0, 0])
    const resolveCropPath = vi.fn()
    const embedFromPath = vi.fn()

    const result = await resolveFaceEmbedding({
      embedding: embeddingToJson(embedding),
      cropPath: 'faces/1.jpg',
      resolveCropPath,
      embedFromPath,
    })

    expect(result).toBeInstanceOf(Float32Array)
    expect(result![0]).toBeCloseTo(1)
    expect(resolveCropPath).not.toHaveBeenCalled()
    expect(embedFromPath).not.toHaveBeenCalled()
  })

  it('falls back to crop embed when stored embedding is missing', async () => {
    const crop = new Float32Array([0, 1, 0])
    const result = await resolveFaceEmbedding({
      embedding: null,
      cropPath: 'faces/1.jpg',
      resolveCropPath: () => '/abs/faces/1.jpg',
      embedFromPath: async (path) => {
        expect(path).toBe('/abs/faces/1.jpg')
        return crop
      },
    })
    expect(result).toBe(crop)
  })

  it('returns null when crop is missing or embed fails', async () => {
    expect(await resolveFaceEmbedding({
      embedding: null,
      cropPath: null,
      resolveCropPath: () => null,
      embedFromPath: async () => new Float32Array([1]),
    })).toBeNull()

    expect(await resolveFaceEmbedding({
      embedding: null,
      cropPath: 'x.jpg',
      resolveCropPath: () => '/x.jpg',
      embedFromPath: async () => {
        throw new Error('onnx down')
      },
    })).toBeNull()
  })
})
