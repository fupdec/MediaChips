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

function defaultClipsOutputDir() {
  return path.join(os.homedir(), 'Downloads', `mediachips-clips-${Date.now()}`)
}

function safeSegmentName(clip: {name?: string; basename?: string; markId: number}, index: number) {
  const base = String(clip.name || clip.basename || `mark-${clip.markId}`)
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64)
  return `seg-${String(index).padStart(4, '0')}-${base || clip.markId}.mp4`
}

export async function* iterateMarkClipsExport(
  db: ApiDb,
  {
    markIds,
    outputPath,
    sort = 'time',
    mode = 'concat',
    shouldStop = (): boolean => false,
  }: {
    markIds: number[]
    outputPath?: string
    sort?: 'time' | 'shuffle' | 'selection'
    mode?: 'concat' | 'folder'
    shouldStop?: () => boolean
  },
) {
  const marksRepo = createMarksRepository(db.drizzle)
  const clips = marksRepo.findClipsByMarkIds(markIds, {sort})
  const total = clips.length
  const exportMode = mode === 'folder' ? 'folder' : 'concat'
  const resolvedOutput = String(outputPath || '').trim()
    || (exportMode === 'folder' ? defaultClipsOutputDir() : defaultClipsOutputPath())

  yield {
    type: 'progress',
    stage: 'prepare',
    processed: 0,
    total,
    remaining: total,
    outputPath: resolvedOutput,
    mode: exportMode,
  }

  if (!total) {
    yield {
      type: 'complete',
      processed: 0,
      total: 0,
      outputPath: resolvedOutput,
      stopped: false,
      mode: exportMode,
      message: 'No ranged marks to export',
    }
    return
  }

  if (exportMode === 'folder') {
    await mkdir(resolvedOutput, {recursive: true})
    let processed = 0

    for (let index = 0; index < clips.length; index++) {
      if (shouldStop()) break

      const clip = clips[index]
      const start = Number(clip.segmentStart) || 0
      const end = Number(clip.segmentEnd)
      const duration = Number.isFinite(end) ? Math.max(0.05, end - start) : 0.05
      const segmentPath = path.join(resolvedOutput, safeSegmentName(clip, index))

      await cutVideoSegment({
        input: String(clip.path),
        outputPath: segmentPath,
        startSeconds: start,
        durationSeconds: duration,
      })
      processed += 1

      yield {
        type: 'progress',
        stage: 'cut',
        processed,
        total,
        remaining: Math.max(total - processed, 0),
        current: clip.path,
        markId: clip.markId,
        outputPath: resolvedOutput,
        mode: exportMode,
      }
    }

    yield {
      type: 'complete',
      processed,
      total,
      outputPath: resolvedOutput,
      stopped: shouldStop() || processed < total,
      mode: exportMode,
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
        mode: exportMode,
      }
    }

    if (shouldStop() || !segmentPaths.length) {
      yield {
        type: 'complete',
        processed: segmentPaths.length,
        total,
        outputPath: resolvedOutput,
        stopped: true,
        mode: exportMode,
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
      mode: exportMode,
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
      mode: exportMode,
    }
  } finally {
    await rm(tempDir, {recursive: true, force: true}).catch(() => undefined)
  }
}
