/** Pure ffmpeg argv / session helpers for live transcode (no spawn). */

export const LIVE_INPUT_SEEK_MARGIN_SECONDS = 20

export interface LiveStreamOptions {
  inputPath: string
  startTime?: number
  duration?: number | null
  audioOnly?: boolean
  maxHeight?: number | null
  /** Remux with stream copy when codecs are already browser-compatible. */
  copyCodecs?: boolean
  /** Frame-accurate start for clip marks (uses keyframe+output skip when possible). */
  accurateSeek?: boolean
  /** Explicit input demuxer seek (seconds). */
  inputSeekTime?: number
  /** Explicit output decode skip after input seek (seconds). */
  outputSeekTime?: number
}

export function buildFfmpegLiveArgs({
  inputPath,
  startTime = 0,
  duration = null,
  audioOnly,
  maxHeight,
  copyCodecs = false,
  accurateSeek: _accurateSeek = false,
  inputSeekTime,
  outputSeekTime,
}: LiveStreamOptions) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin']
  const start = Math.max(0, Number(startTime) || 0)
  const hasExplicitSeek = inputSeekTime != null || outputSeekTime != null
  const inputSeek = Math.max(0, Number(inputSeekTime) || 0)
  const outputSeek = Math.max(0, Number(outputSeekTime) || 0)
  const hasDuration = duration != null && Number(duration) > 0
  // Absolute -ss/-t with -copyts lands on the exact timeline, then setpts
  // rewrites the fragmented MP4 so the browser element still starts at t=0.
  let useAbsoluteTimelineSeek = false

  // Prefer fast input seeks. Never decode from t=0 to a mid-file mark — that
  // can take minutes. Cap any output-side skip so startup stays responsive.
  if (copyCodecs) {
    if (start > 0) args.push('-ss', String(start))
    args.push('-i', inputPath)
  } else if (hasExplicitSeek) {
    const cappedOutput = Math.min(outputSeek, LIVE_INPUT_SEEK_MARGIN_SECONDS)
    const overflow = Math.max(0, outputSeek - cappedOutput)
    const adjustedInput = Math.max(0, inputSeek + overflow)
    if (adjustedInput > 0.05) args.push('-ss', String(adjustedInput))
    args.push('-i', inputPath)
    if (start > 0.05) {
      args.push('-copyts')
      args.push('-ss', String(start))
      useAbsoluteTimelineSeek = true
    } else if (cappedOutput > 0.05) {
      args.push('-ss', String(cappedOutput))
    }
  } else if (start > 0.05) {
    if (start > LIVE_INPUT_SEEK_MARGIN_SECONDS) {
      args.push('-ss', String(start - LIVE_INPUT_SEEK_MARGIN_SECONDS))
    }
    args.push('-i', inputPath)
    args.push('-copyts')
    args.push('-ss', String(start))
    useAbsoluteTimelineSeek = true
  } else {
    args.push('-i', inputPath)
  }

  if (hasDuration) {
    args.push('-t', String(duration))
  }

  if (audioOnly) {
    if (copyCodecs) {
      args.push('-vn', '-c:a', 'copy')
    } else {
      args.push('-vn', '-c:a', 'aac', '-b:a', '192k')
      if (useAbsoluteTimelineSeek) {
        args.push('-af', 'asetpts=PTS-STARTPTS')
      }
    }
  } else if (copyCodecs) {
    // Container remux only — used when Chromium rejects a "compatible" MP4.
    args.push('-c', 'copy')
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      // Regular keyframes so frag_keyframe can flush the end of each chunk
      // instead of dropping the last ~1–2s when -t cuts mid-GOP.
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
    )
    const videoFilters: string[] = []
    if (maxHeight) {
      // Cap by height and never upscale past the source (ih).
      videoFilters.push(`scale=-2:'min(ih,${maxHeight})'`)
    }
    if (useAbsoluteTimelineSeek) {
      videoFilters.push('setpts=PTS-STARTPTS')
    }
    if (videoFilters.length > 0) {
      args.push('-vf', videoFilters.join(','))
    }
    args.push('-c:a', 'aac', '-b:a', '192k')
    if (useAbsoluteTimelineSeek) {
      args.push('-af', 'asetpts=PTS-STARTPTS')
    }
  }

  args.push(
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    // Flush on a 1s clock as well as keyframes so the final partial GOP is written.
    '-frag_duration', '1000000',
    '-f', 'mp4',
    'pipe:1',
  )

  return args
}

export function buildSessionKey(
  streamKey: string,
  startTime: number,
  maxHeight: number | null = null,
  copyCodecs = false,
) {
  const heightPart = maxHeight == null ? 'auto' : String(maxHeight)
  const base = `${streamKey}@${Number(startTime).toFixed(2)}@${heightPart}`
  return copyCodecs ? `${base}@copy` : base
}

export function shouldRejectDuplicateStream(
  existing: {startedAt?: number; stopped?: boolean} | undefined,
  now = Date.now(),
) {
  if (!existing || existing.stopped) return false
  return (now - (existing.startedAt || 0)) < 5000
}
