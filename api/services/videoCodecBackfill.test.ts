import {describe, expect, it, vi, beforeEach} from 'vitest'
import {getVideoCodecBackfillStatus, iterateVideoCodecBackfill} from './videoCodecBackfill'

const probeVideoMetadata = vi.fn()
const resolveExistingPath = vi.fn()
const findByMediaId = vi.fn()
const upsert = vi.fn()

vi.mock('./videoMetadataProbe', () => ({
  probeVideoMetadata: (...args: unknown[]) => probeVideoMetadata(...args),
}))

vi.mock('./contentHash', () => ({
  resolveExistingPath: (...args: unknown[]) => resolveExistingPath(...args),
}))

vi.mock('../db/repositories/videoMetadata', () => ({
  createVideoMetadataRepository: () => ({
    findByMediaId,
    upsert,
  }),
}))

function createDb(rows: Array<{id: number; path: string; codec?: string | null}>) {
  return {
    drizzle: {},
    sqlite: {
      prepare(sql: string) {
        const normalized = sql.replace(/\s+/g, ' ').trim()

        return {
          get(...params: unknown[]) {
            const lastId = Number(params[0] || 0)

            if (normalized.includes('COUNT(*)') && normalized.includes("mt.type = 'video'")) {
              if (normalized.includes('vm.codec IS NULL')) {
                const pending = rows.filter((row) => !row.codec).length
                return {count: pending}
              }
              return {count: rows.length}
            }

            if (normalized.includes('SELECT m.id, m.path')) {
              const candidates = rows
                .filter((row) => row.id > lastId)
                .filter((row) => {
                  if (!normalized.includes('vm.codec IS NULL')) return true
                  return !row.codec
                })
                .sort((a, b) => a.id - b.id)

              return candidates[0]
            }

            return undefined
          },
          all() {
            return []
          },
          run() {},
        }
      },
    },
  } as never
}

describe('videoCodecBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveExistingPath.mockImplementation(async (path: string) => path)
    findByMediaId.mockReturnValue({time: 42})
    probeVideoMetadata.mockResolvedValue({
      duration: 120,
      bitrate: 3000000,
      width: 1280,
      height: 720,
      codec: 'hevc',
      fps: 30,
    })
  })

  it('returns pending codec status', async () => {
    const db = createDb([
      {id: 1, path: '/a.mp4', codec: 'h264'},
      {id: 2, path: '/b.mp4', codec: null},
    ])

    await expect(getVideoCodecBackfillStatus(db)).resolves.toEqual({
      total: 2,
      pending: 1,
      filled: 1,
    })
  })

  it('updates metadata for pending videos', async () => {
    const db = createDb([
      {id: 1, path: '/a.mp4', codec: null},
    ])

    const events = []
    for await (const event of iterateVideoCodecBackfill(db)) {
      events.push(event)
    }

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      mediaId: 1,
      codec: 'hevc',
      time: 42,
    }))
    expect(events[events.length - 1]).toMatchObject({
      type: 'complete',
      updated: 1,
      failed: 0,
      missing: 0,
    })
  })
})
