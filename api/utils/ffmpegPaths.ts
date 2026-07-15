import fs from 'fs'

function resolveBundledBinary(modulePath: string | null | undefined): string {
  if (!modulePath) return modulePath as string

  const candidates = [modulePath]

  if (modulePath.includes('app.asar')) {
    candidates.unshift(modulePath.replace('app.asar', 'app.asar.unpacked'))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return modulePath
}

function resolvePathFromEnvOrBundled(envName: string, bundledPath: string | null | undefined): string {
  const fromEnv = process.env[envName]
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv
  }

  return resolveBundledBinary(bundledPath)
}

function getFfmpegPath(): string {
  return resolvePathFromEnvOrBundled('FFMPEG_PATH', require('ffmpeg-static'))
}

function getFfprobePath(): string {
  return resolvePathFromEnvOrBundled('FFPROBE_PATH', require('ffprobe-static').path)
}

export {
  getFfmpegPath,
  getFfprobePath,
  resolveBundledBinary,
}
