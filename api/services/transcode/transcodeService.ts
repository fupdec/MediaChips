import type {Request, Response} from 'express'
import fs from 'fs'
import path from 'path'
import { ffprobe, ffprobePlayability } from '../../utils/ffmpeg'
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
import {ensureProgressiveRemux, lookupRemuxCache} from './remuxCache'
import {
  getTranscodeSettings,
  isTranscodeEnabled,
  getMaxHeight,
} from './transcodeSettings'
import { createLiveStreamRegistry } from './liveStreamTranscode'
import {
  getChunkDuration,
} from './liveStreamChunk'
import {
  buildMissingPlaybackPlan,
  isPlayabilityProbeIncomplete,
  resolveLiveStreamCopyCodecs,
  resolvePlaybackPlanFromPlayability,
  type PlaybackPlan,
  type PlayabilityResult,
} from './playbackPlanResolve'

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma',
])

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
  accurateSeek?: boolean
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

    // Codec probe only — do not await the MP4 layout scan here. Direct-first
    // playback means needsRemux is advisory; scanning 8MB on NAS made every
    // hover /playable check take 0.5–1.5s before the first video byte.
    let probe = await ffprobePlayability(filePath)
    if (isPlayabilityProbeIncomplete(probe, {audioOnly})) {
      probe = await ffprobe(filePath)
    }

    const duration = Number(probe.format?.duration || 0)
    const analyzed = analyzeProbeResult(probe, filePath, {audioOnly})
    const result: PlayabilityResult = {
      playable: analyzed.playable,
      reason: analyzed.reason,
      videoCodec: analyzed.videoCodec ?? null,
      audioCodec: analyzed.audioCodec ?? null,
      duration,
      needsRemux: false,
    }
    setPlayabilityCacheEntry(cacheKey, result)

    const mayNeedRemux = Boolean(analyzed.playable && !audioOnly
      && (extension === '.mp4' || extension === '.m4v'))
    if (mayNeedRemux) {
      // Defer the sync 8MB layout scan so /playable can return after ffprobe.
      void Promise.resolve().then(() => {
        try {
          if (!needsBrowserRemuxForMp4(filePath)) return
          const cached = playabilityCache.get(cacheKey)
          if (!cached || cached.needsRemux) return
          setPlayabilityCacheEntry(cacheKey, {
            ...cached,
            needsRemux: true,
            reason: 'container_layout',
          })
        } catch {
          // ignore layout scan failures
        }
      })
    }

    return result
  }

  function scheduleLayoutRemux(filePath: string, settings: Awaited<ReturnType<typeof getTranscodeSettings>>) {
    const dbId = getActiveDbId()
    if (!dbId) return null
    return ensureProgressiveRemux({
      databasesPath,
      dbId,
      filePath,
      maxCacheGb: Number(settings.transcodeCacheMaxGb),
    })
  }

  async function getPlaybackPlan(filePath: string, options: Record<string, unknown> = {}): Promise<PlaybackPlan> {
    const settings = (options.settings as Awaited<ReturnType<typeof getTranscodeSettings>> | undefined)
      || await getTranscodeSettings(db)
    const transcodeEnabled = (options.transcodeEnabled as boolean | undefined) ?? isTranscodeEnabled(settings)

    if (!filePath || !fs.existsSync(filePath)) {
      return buildMissingPlaybackPlan()
    }

    const playability = await analyzePlayability(filePath)
    // Codec-compatible MP4s with bad layout stay on direct first; clients may
    // fall back to live re-encode on Chromium stall (never remux-copy — black frame).
    // Progressive remux is scheduled only when a stream is actually opened
    // (resolveStreamPath / streamLive) so hover/playable checks cannot fill the
    // remux queue and contend with live playback.
    return resolvePlaybackPlanFromPlayability({playability, transcodeEnabled})
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
      if (plan.reason === 'container_layout' || plan.playability?.needsRemux) {
        const dbId = getActiveDbId()
        if (dbId) {
          const cached = lookupRemuxCache(databasesPath, dbId, filePath)
          if (cached?.ready) {
            return {filePath: cached.outputPath, contentType: 'video/mp4', plan}
          }
          scheduleLayoutRemux(filePath, settings)
        }
      }
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
    // Use the exact requested start. Chunk-aligning forced the client to seek
    // inside a non-seekable fMP4 pipe, which silently stayed at t=0 (up to ~30s early).
    const streamStart = Math.max(0, Number(options.startTime) || 0)
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
    // Short windows only: encoding to EOF made every seek/scrub re-encode the
    // whole remainder and look like endless transcoding while browsing.
    const chunkDuration = getChunkDuration({
      chunkStart: streamStart,
      fileDuration,
    })
    // Never stream-copy pathological MP4 layouts: Chromium plays audio with a black frame.
    // Also skip copy when starting mid-file — copy can only cut on keyframes and lands early.
    const copyCodecs = resolveLiveStreamCopyCodecs({
      requestedCopy: Boolean(options.copyCodecs),
      playable: playability.playable,
      needsRemux: playability.needsRemux,
      streamStart,
    })

    // Live fallback for layout issues also warms the progressive remux cache.
    if (playability.needsRemux) {
      scheduleLayoutRemux(filePath, settings)
    }

    // Do not probe keyframes or decode-from-zero for "accurate" starts — both add
    // multi-second (sometimes multi-minute) latency before the first frame.
    liveStreams.pipeLiveTranscode(req, res, {
      streamKey: cacheInfo.cacheKey,
      inputPath: filePath,
      startTime: streamStart,
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
