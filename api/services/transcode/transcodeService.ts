import type {Request, Response} from 'express'
import fs from 'fs'
import path from 'path'
import { ffprobePlayability } from '../../utils/ffmpeg'
import {
  DIRECT_VIDEO_CONTAINERS,
  DIRECT_AUDIO_CONTAINERS,
  analyzeProbeResult,
} from './codecCompatibility'
import { needsBrowserRemuxForMp4 } from './mp4ContainerLayout'
import {
  resolveExistingCache,
  getCacheStats,
  clearCache,
} from './transcodeCache'
import {
  getTranscodeSettings,
  isTranscodeEnabled,
  getMaxHeight,
} from './transcodeSettings'
import { createLiveStreamRegistry } from './liveStreamTranscode'
import {
  getChunkStart,
  getChunkDuration,
} from './liveStreamChunk'

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma',
])

interface PlayabilityResult {
  playable: boolean
  reason: string | null
  videoCodec: string | null
  audioCodec: string | null
  duration: number
  needsRemux?: boolean
}

interface PlaybackPlan {
  mode: string
  transcodeRequired: boolean
  transcodeEnabled?: boolean
  transcodeStatus: string
  progress: number
  error: string | null
  reason: string | null
  playability?: PlayabilityResult
  streamPlayback?: boolean
  remuxCopy?: boolean
}

interface TranscodeManagerOptions {
  databasesPath: string
  getActiveDbId: () => string | null | undefined
  db: Parameters<typeof getTranscodeSettings>[0]
}

interface StreamLiveOptions {
  startTime?: number
  audioOnly?: boolean
  maxHeight?: number | null
  copyCodecs?: boolean
  settings?: Awaited<ReturnType<typeof getTranscodeSettings>>
  transcodeEnabled?: boolean
}

function isAudioFilePath(filePath: string | null | undefined): boolean {
  const ext = path.extname(filePath || '').toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

function createTranscodeManager({databasesPath, getActiveDbId, db}: TranscodeManagerOptions) {
  const playabilityCache = new Map<string, PlayabilityResult>()
  const PLAYABILITY_CACHE_MAX = 500
  const liveStreams = createLiveStreamRegistry()

  function getPlayabilityCacheKey(filePath: string, stat: {mtimeMs: number; size: number}): string {
    return `${filePath}|${stat.mtimeMs}|${stat.size}`
  }

  function setPlayabilityCacheEntry(cacheKey: string, result: PlayabilityResult): void {
    if (playabilityCache.has(cacheKey)) {
      playabilityCache.delete(cacheKey)
    }
    playabilityCache.set(cacheKey, result)

    while (playabilityCache.size > PLAYABILITY_CACHE_MAX) {
      const oldestKey = playabilityCache.keys().next().value as string | undefined
      if (!oldestKey) break
      playabilityCache.delete(oldestKey)
    }
  }

  async function analyzePlayability(filePath: string): Promise<PlayabilityResult> {
    if (!filePath || !fs.existsSync(filePath)) {
      return {playable: false, reason: 'missing', videoCodec: null, audioCodec: null, duration: 0}
    }

    const stat = fs.statSync(filePath)
    const cacheKey = getPlayabilityCacheKey(filePath, stat)

    const cached = playabilityCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const audioOnly = isAudioFilePath(filePath)
    const extension = path.extname(filePath).toLowerCase()

    // Fast path: containers Chromium can't play directly always need
    // live transcoding — skip ffprobe entirely for playback planning.
    if (audioOnly) {
      if (!DIRECT_AUDIO_CONTAINERS.has(extension)) {
        const result: PlayabilityResult = {
          playable: false,
          reason: 'container',
          videoCodec: null,
          audioCodec: null,
          duration: 0,
          needsRemux: false,
        }
        setPlayabilityCacheEntry(cacheKey, result)
        return result
      }
    } else if (!DIRECT_VIDEO_CONTAINERS.has(extension)) {
      const result: PlayabilityResult = {
        playable: false,
        reason: 'container',
        videoCodec: null,
        audioCodec: null,
        duration: 0,
        needsRemux: false,
      }
      setPlayabilityCacheEntry(cacheKey, result)
      return result
    }

    // Run remux layout scan in parallel with the lightweight codec probe.
    const mayNeedRemux = !audioOnly && (extension === '.mp4' || extension === '.m4v')
    const remuxPromise = mayNeedRemux
      ? Promise.resolve().then(() => needsBrowserRemuxForMp4(filePath))
      : Promise.resolve(false)

    const probe = await ffprobePlayability(filePath)
    const duration = Number(probe.format?.duration || 0)
    const analyzed = analyzeProbeResult(probe, filePath, {audioOnly})
    const needsRemux = Boolean(analyzed.playable && !audioOnly && await remuxPromise)
    const result: PlayabilityResult = {
      playable: analyzed.playable,
      reason: needsRemux ? 'container_layout' : analyzed.reason,
      videoCodec: analyzed.videoCodec ?? null,
      audioCodec: analyzed.audioCodec ?? null,
      duration,
      needsRemux,
    }
    setPlayabilityCacheEntry(cacheKey, result)
    return result
  }

  async function getPlaybackPlan(filePath: string, options: Record<string, unknown> = {}): Promise<PlaybackPlan> {
    const settings = (options.settings as Awaited<ReturnType<typeof getTranscodeSettings>> | undefined)
      || await getTranscodeSettings(db)
    const transcodeEnabled = (options.transcodeEnabled as boolean | undefined) ?? isTranscodeEnabled(settings)

    if (!filePath || !fs.existsSync(filePath)) {
      return {
        mode: 'missing',
        transcodeRequired: false,
        transcodeStatus: 'none',
        progress: 100,
        error: 'File not found',
        reason: 'missing',
      }
    }

    const playability = await analyzePlayability(filePath)

    // Codec-compatible MP4s can still freeze Chromium on seek; live-transcode
    // (re-encode) is required — stream-copy remux still yields black video in Chromium.
    if (playability.playable && playability.needsRemux) {
      return {
        mode: 'stream',
        transcodeRequired: true,
        transcodeEnabled,
        transcodeStatus: 'stream',
        streamPlayback: true,
        remuxCopy: false,
        progress: 0,
        error: null,
        reason: 'container_layout',
        playability,
      }
    }

    if (playability.playable) {
      return {
        mode: 'direct',
        transcodeRequired: false,
        transcodeEnabled,
        transcodeStatus: 'none',
        progress: 100,
        error: null,
        reason: playability.reason,
        playability,
      }
    }

    if (!transcodeEnabled) {
      return {
        mode: 'unsupported',
        transcodeRequired: false,
        transcodeEnabled: false,
        transcodeStatus: 'disabled',
        progress: 100,
        error: null,
        reason: playability.reason,
        playability,
      }
    }

    return {
      mode: 'stream',
      transcodeRequired: true,
      transcodeStatus: 'stream',
      streamPlayback: true,
      progress: 0,
      error: null,
      reason: playability.reason,
      playability,
    }
  }

  async function resolveStreamPath(
    filePath: string,
    source = 'auto',
    options: Record<string, unknown> = {},
  ) {
    const settings = (options.settings as Awaited<ReturnType<typeof getTranscodeSettings>> | undefined)
      || await getTranscodeSettings(db)
    const transcodeEnabled = (options.transcodeEnabled as boolean | undefined) ?? isTranscodeEnabled(settings)
    const plan = await getPlaybackPlan(filePath, {settings, transcodeEnabled})

    if (source === 'direct') {
      return {filePath, contentType: null, plan}
    }

    if (plan.mode === 'direct') {
      return {filePath, contentType: null, plan}
    }

    return {filePath: null, contentType: null, plan}
  }

  async function streamLive(
    req: Request,
    res: Response,
    filePath: string,
    options: StreamLiveOptions = {},
  ): Promise<void> {
    const settings = options.settings || await getTranscodeSettings(db)
    const requestedStart = Math.max(0, Number(options.startTime) || 0)
    const chunkStart = getChunkStart(requestedStart)
    const audioOnly = options.audioOnly ?? isAudioFilePath(filePath)
    const maxHeight = options.maxHeight ?? getMaxHeight(settings)
    const dbId = getActiveDbId()
    if (!dbId) {
      res.status(404).json({message: 'No active database'})
      return
    }
    const cacheInfo = resolveExistingCache(databasesPath, dbId, filePath)

    if (!cacheInfo) {
      res.status(404).json({message: 'Source file not found'})
      return
    }

    const playability = await analyzePlayability(filePath)
    const fileDuration = Number(playability.duration || 0)
    const chunkDuration = getChunkDuration({
      chunkStart,
      fileDuration,
    })
    const codecsCopySafe = Boolean(playability.playable && !playability.needsRemux)
    // Never stream-copy pathological MP4 layouts: Chromium plays audio with a black frame.
    const copyCodecs = Boolean(options.copyCodecs) && codecsCopySafe && !playability.needsRemux

    liveStreams.pipeLiveTranscode(req, res, {
      streamKey: cacheInfo.cacheKey,
      inputPath: filePath,
      startTime: chunkStart,
      duration: chunkDuration,
      audioOnly,
      maxHeight: copyCodecs ? null : maxHeight,
      copyCodecs,
    })
  }

  function stopLiveStream(filePath: string): boolean {
    const dbId = getActiveDbId()
    if (!dbId || !filePath) return false

    const cacheInfo = resolveExistingCache(databasesPath, dbId, filePath)
    if (!cacheInfo) return false

    liveStreams.stopStream(cacheInfo.cacheKey)
    return true
  }

  function stopAllLiveStreams(): boolean {
    liveStreams.stopAll()
    return true
  }

  async function getTranscodeStatus(filePath: string) {
    const plan = await getPlaybackPlan(filePath)
    return {
      mode: plan.mode,
      transcodeRequired: plan.transcodeRequired,
      transcodeEnabled: plan.transcodeEnabled ?? true,
      streamPlayback: plan.streamPlayback ?? plan.mode === 'stream',
      status: plan.transcodeStatus,
      progress: plan.progress,
      error: plan.error,
      reason: plan.reason,
    }
  }

  return {
    analyzePlayability,
    getPlaybackPlan,
    resolveStreamPath,
    streamLive,
    stopLiveStream,
    stopAllLiveStreams,
    getTranscodeStatus,
    clearCacheForActiveDb() {
      const dbId = getActiveDbId()
      if (!dbId) return {removed: 0, bytes: 0}
      return clearCache(databasesPath, dbId)
    },
    getCacheStatsForActiveDb() {
      const dbId = getActiveDbId()
      if (!dbId) return {bytes: 0, files: 0, entries: 0}
      return getCacheStats(databasesPath, dbId)
    },
  }
}

export { createTranscodeManager, isAudioFilePath }
