/**
 * @vitest-environment node
 */
import {describe, expect, it, vi, beforeEach} from 'vitest'

const {findClipsByMarkIds, cutVideoSegment, concatVideoSegments, mkdir} = vi.hoisted(() => ({
  findClipsByMarkIds: vi.fn(),
  cutVideoSegment: vi.fn(),
  concatVideoSegments: vi.fn(),
  mkdir: vi.fn(),
}))

vi.mock('../db/repositories/marks', () => ({
  createMarksRepository: () => ({findClipsByMarkIds}),
}))

vi.mock('../utils/ffmpeg', () => ({
  cutVideoSegment,
  concatVideoSegments,
}))

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return {
    ...actual,
    mkdir,
    mkdtemp: vi.fn(async () => '/tmp/mc-clips-test'),
    rm: vi.fn(async () => undefined),
  }
})

import {iterateMarkClipsExport} from './markClipsExport'

describe('iterateMarkClipsExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findClipsByMarkIds.mockReturnValue([
      {
        id: 100,
        markId: 1,
        path: '/a.mp4',
        name: 'A',
        basename: 'a.mp4',
        segmentStart: 1,
        segmentEnd: 3,
      },
      {
        id: 101,
        markId: 2,
        path: '/b.mp4',
        name: 'B',
        basename: 'b.mp4',
        segmentStart: 4,
        segmentEnd: 6,
      },
    ])
    cutVideoSegment.mockResolvedValue(undefined)
    concatVideoSegments.mockResolvedValue(undefined)
    mkdir.mockResolvedValue(undefined)
  })

  it('folder mode cuts segments and skips concat', async () => {
    const events: Array<Record<string, unknown>> = []
    for await (const event of iterateMarkClipsExport({drizzle: {}} as never, {
      markIds: [1, 2],
      outputPath: '/tmp/out-folder',
      sort: 'selection',
      mode: 'folder',
    })) {
      events.push(event as Record<string, unknown>)
    }

    expect(findClipsByMarkIds).toHaveBeenCalledWith([1, 2], {sort: 'selection'})
    expect(cutVideoSegment).toHaveBeenCalledTimes(2)
    expect(concatVideoSegments).not.toHaveBeenCalled()
    expect(events[events.length - 1]).toMatchObject({
      type: 'complete',
      mode: 'folder',
      outputPath: '/tmp/out-folder',
      processed: 2,
    })
  })

  it('concat mode still concatenates', async () => {
    const events: Array<Record<string, unknown>> = []
    for await (const event of iterateMarkClipsExport({drizzle: {}} as never, {
      markIds: [1, 2],
      outputPath: '/tmp/out.mp4',
      mode: 'concat',
    })) {
      events.push(event as Record<string, unknown>)
    }

    expect(concatVideoSegments).toHaveBeenCalledTimes(1)
    expect(events.some((event) => event.stage === 'concat')).toBe(true)
    expect(events[events.length - 1]).toMatchObject({
      type: 'complete',
      mode: 'concat',
      outputPath: '/tmp/out.mp4',
    })
  })
})
