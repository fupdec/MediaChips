import {mkdir, mkdtemp, rm} from 'fs/promises'
import os from 'os'
import path from 'path'
import type {ApiDb} from '../types/db'
import {createMarksRepository} from '../db/repositories/marks'
import {concatVideoSegments, cutVideoSegment} from '../utils/ffmpeg'

function defaultClipsOutputPath() {
  const downloads = path.join(os.homedir(), 'Downloads')
  return path.join(downloads, `mediachips-clips-${Date.now()}.mp4`)
}

export async function* iterateMarkClipsExport(
  db: ApiDb,
  {
    markIds,
    outputPath,
    sort = 'time',
    shouldStop = (): boolean => false,
  }: {
    markIds: number[]
    outputPath?: string
    sort?: 'time' | 'shuffle'
    shouldStop?: () => boolean
  },
) {
  const marksRepo = createMarksRepository(db.drizzle)
  const clips = marksRepo.findClipsByMarkIds(markIds, {sort})
  const total = clips.length
  const resolvedOutput = String(outputPath || '').trim() || defaultClipsOutputPath()

  yield {
    type: 'progress',
    stage: 'prepare',
    processed: 0,
    total,
    remaining: total,
    outputPath: resolvedOutput,
  }

  if (!total) {
    yield {
      type: 'complete',
      processed: 0,
      total: 0,
      outputPath: resolvedOutput,
      stopped: false,
      message: 'No ranged marks to export',
    }
    return
  }

  await mkdir(path.dirname(resolvedOutput), {recursive: true})
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mc-clips-'))
  const segmentPaths: string[] = []

  try {
    for (let index = 0; index < clips.length; index++) {
      if (shouldStop()) break

      const clip = clips[index]
      const start = Number(clip.segmentStart) || 0
      const end = Number(clip.segmentEnd)
      const duration = Number.isFinite(end) ? Math.max(0.05, end - start) : 0.05
      const segmentPath = path.join(tempDir, `seg-${String(index).padStart(4, '0')}.mp4`)

      await cutVideoSegment({
        input: String(clip.path),
        outputPath: segmentPath,
        startSeconds: start,
        durationSeconds: duration,
      })
      segmentPaths.push(segmentPath)

      yield {
        type: 'progress',
        stage: 'cut',
        processed: index + 1,
        total,
        remaining: Math.max(total - (index + 1), 0),
        current: clip.path,
        markId: clip.markId,
        outputPath: resolvedOutput,
      }
    }

    if (shouldStop() || !segmentPaths.length) {
      yield {
        type: 'complete',
        processed: segmentPaths.length,
        total,
        outputPath: resolvedOutput,
        stopped: true,
      }
      return
    }

    yield {
      type: 'progress',
      stage: 'concat',
      processed: total,
      total,
      remaining: 0,
      outputPath: resolvedOutput,
    }

    await concatVideoSegments({
      segmentPaths,
      outputPath: resolvedOutput,
      listFilePath: path.join(tempDir, 'concat.txt'),
    })

    yield {
      type: 'complete',
      processed: total,
      total,
      outputPath: resolvedOutput,
      stopped: false,
    }
  } finally {
    await rm(tempDir, {recursive: true, force: true}).catch(() => undefined)
  }
}
