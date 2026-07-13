import type {ChildProcess} from 'child_process'
import type {Request, Response} from 'express'
import { spawn } from 'child_process'
import { getFfmpegPath } from '../../utils/ffmpegPaths'
import { isClientAbortError } from '../../../app/server/fileResolver'

interface LiveStreamOptions {
  inputPath: string
  startTime?: number
  duration?: number | null
  audioOnly?: boolean
  maxHeight?: number | null
  /** Remux with stream copy when codecs are already browser-compatible. */
  copyCodecs?: boolean
}

interface ActiveStream {
  sessionKey: string
  streamKey: string
  startedAt: number
  proc: ChildProcess
  res: Response
  req: Request
  pipe: { destroy?: () => void; on: (event: string, listener: (error: unknown) => void) => void } | null
  stopped: boolean
  onClientAbort: (() => void) | null
  onSocketClose: (() => void) | null
  onResponseError: ((error: unknown) => void) | null
  onResponseClose: (() => void) | null
}

function buildFfmpegLiveArgs({
  inputPath,
  startTime = 0,
  duration = null,
  audioOnly,
  maxHeight,
  copyCodecs = false,
}: LiveStreamOptions) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin']

  if (startTime > 0) {
    args.push('-ss', String(startTime))
  }

  args.push('-i', inputPath)

  if (duration != null && duration > 0) {
    args.push('-t', String(duration))
  }

  if (audioOnly) {
    if (copyCodecs) {
      args.push('-vn', '-c:a', 'copy')
    } else {
      args.push('-vn', '-c:a', 'aac', '-b:a', '192k')
    }
  } else if (copyCodecs) {
    // Container remux only — used when Chromium rejects a "compatible" MP4.
    args.push('-c', 'copy')
  } else {
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '23', '-pix_fmt', 'yuv420p')
    if (maxHeight) {
      args.push('-vf', `scale='min(${maxHeight},iw)':-2`)
    }
    args.push('-c:a', 'aac', '-b:a', '192k')
  }

  args.push(
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  )

  return args
}

function isIgnorableStreamError(error: NodeJS.ErrnoException | null | undefined) {
  if (!error) return true
  if (isClientAbortError(error)) return true

  const code = error.code
  return code === 'ECONNRESET'
    || code === 'EPIPE'
    || code === 'ERR_STREAM_WRITE_AFTER_END'
}

function buildSessionKey(
  streamKey: string,
  startTime: number,
  maxHeight: number | null = null,
  copyCodecs = false,
) {
  const heightPart = maxHeight == null ? 'auto' : String(maxHeight)
  const base = `${streamKey}@${Number(startTime).toFixed(2)}@${heightPart}`
  return copyCodecs ? `${base}@copy` : base
}

function shouldRejectDuplicateStream(
  existing: {startedAt?: number; stopped?: boolean} | undefined,
  now = Date.now(),
) {
  if (!existing || existing.stopped) return false
  return (now - (existing.startedAt || 0)) < 5000
}

function createLiveStreamRegistry() {
  const activeStreams = new Map<string, ActiveStream>()

  function destroyActiveStream(active: ActiveStream | undefined) {
    if (!active || active.stopped) return

    active.stopped = true
    activeStreams.delete(active.sessionKey)

    if (active.req && active.onClientAbort) {
      active.req.removeListener('aborted', active.onClientAbort)
    }

    if (active.req?.socket && active.onSocketClose) {
      active.req.socket.removeListener('close', active.onSocketClose)
    }

    if (active.res && active.onResponseError) {
      active.res.removeListener('error', active.onResponseError)
      active.res.removeListener('close', active.onResponseClose!)
    }

    if (active.proc?.stdout && active.res) {
      try {
        active.proc.stdout.unpipe(active.res)
      } catch {
        // ignore
      }
    }

    if (active.pipe?.destroy) {
      try {
        active.pipe.destroy()
      } catch {
        // ignore
      }
    }

    try {
      active.proc?.stdout?.destroy()
      active.proc?.stderr?.destroy()
    } catch {
      // ignore
    }

    try {
      active.proc?.kill('SIGKILL')
    } catch {
      // ignore
    }

    if (active.res && !active.res.writableEnded && !active.res.destroyed) {
      try {
        active.res.destroy()
      } catch {
        // ignore
      }
    }
  }

  function stopStreamsForFile(streamKey: string, exceptSessionKey: string | null = null) {
    for (const [key, active] of activeStreams) {
      if (key.startsWith(`${streamKey}@`) && key !== exceptSessionKey) {
        destroyActiveStream(active)
      }
    }
  }

  function stopStream(streamKey: string) {
    stopStreamsForFile(streamKey)
  }

  function pipeLiveTranscode(
    req: Request,
    res: Response,
    {
      streamKey,
      inputPath,
      startTime = 0,
      duration = null,
      audioOnly = false,
      maxHeight = null,
      copyCodecs = false,
    }: LiveStreamOptions & {streamKey: string},
  ) {
    const sessionKey = buildSessionKey(streamKey, startTime, maxHeight, copyCodecs)
    const existing = activeStreams.get(sessionKey)

    if (existing && !existing.stopped) {
      if (shouldRejectDuplicateStream(existing)) {
        res.status(409).end()
        return
      }
      destroyActiveStream(existing)
    }

    stopStreamsForFile(streamKey, sessionKey)

    res.status(200)
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Accept-Ranges', 'none')

    const args = buildFfmpegLiveArgs({
      inputPath,
      startTime,
      duration,
      audioOnly,
      maxHeight: copyCodecs ? null : maxHeight,
      copyCodecs,
    })

    const proc = spawn(getFfmpegPath(), args, {stdio: ['ignore', 'pipe', 'pipe']})
    let stderr = ''

    const active: ActiveStream = {
      sessionKey,
      streamKey,
      startedAt: Date.now(),
      proc,
      res,
      req,
      pipe: null,
      stopped: false,
      onClientAbort: null,
      onSocketClose: null,
      onResponseError: null,
      onResponseClose: null,
    }

    activeStreams.set(sessionKey, active)

    const cleanup = () => destroyActiveStream(active)

    active.onResponseClose = () => {
      if (active.stopped) return
      if (!res.writableFinished && !res.writableEnded) {
        cleanup()
      }
    }

    active.onResponseError = (error: unknown) => {
      if (!isIgnorableStreamError(error as NodeJS.ErrnoException)) {
        console.error('Live transcode response error:', error)
      }
      cleanup()
    }

    active.onClientAbort = cleanup

    res.on('error', active.onResponseError)
    res.on('close', active.onResponseClose)
    req.on('aborted', active.onClientAbort)

    if (req.socket) {
      active.onSocketClose = () => {
        if (active.stopped || res.writableFinished || res.writableEnded) return
        cleanup()
      }
      req.socket.on('close', active.onSocketClose)
    }

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.stdout?.on('error', (error: unknown) => {
      if (!isIgnorableStreamError(error as NodeJS.ErrnoException)) {
        console.error('Live transcode stdout error:', error)
      }
      cleanup()
    })

    if (proc.stdout) {
      active.pipe = proc.stdout.pipe(res, {end: true})
      active.pipe?.on('error', (error: unknown) => {
        if (!isIgnorableStreamError(error as NodeJS.ErrnoException)) {
          console.error('Live transcode pipe error:', error)
        }
        cleanup()
      })
    }

    proc.on('error', (error: Error) => {
      console.error('Live transcode process error:', error)
      cleanup()
      if (!res.headersSent) {
        res.status(500).json({message: error.message})
      }
    })

    proc.on('close', (code: number | null) => {
      if (active.stopped) return

      if (code !== 0 && !res.writableEnded && stderr) {
        console.error('Live transcode failed:', stderr.trim())
      }

      destroyActiveStream(active)
    })
  }

  function stopAll() {
    for (const active of [...activeStreams.values()]) {
      destroyActiveStream(active)
    }
  }

  return {
    pipeLiveTranscode,
    stopStream,
    stopAll,
  }
}

export {
  buildFfmpegLiveArgs,
  buildSessionKey,
  shouldRejectDuplicateStream,
  createLiveStreamRegistry,
  isIgnorableStreamError,
}

