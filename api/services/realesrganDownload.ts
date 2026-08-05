/** Pure Real-ESRGAN download / geometry helpers (no FS / network). */

export const REALESRGAN_NCNN_RELEASE = 'v0.2.5.0'
export const REALESRGAN_NCNN_BUILD = '20220424'

type PlatformZipKey = 'darwin' | 'win32' | 'linux'

const PLATFORM_ZIP: Record<PlatformZipKey, string> = {
  darwin: `realesrgan-ncnn-vulkan-${REALESRGAN_NCNN_BUILD}-macos.zip`,
  win32: `realesrgan-ncnn-vulkan-${REALESRGAN_NCNN_BUILD}-windows.zip`,
  linux: `realesrgan-ncnn-vulkan-${REALESRGAN_NCNN_BUILD}-ubuntu.zip`,
}

export function getRealesrganZipFileName(platform: NodeJS.Platform = process.platform): string {
  const key = (platform === 'darwin' || platform === 'win32' || platform === 'linux')
    ? platform
    : 'linux'
  return PLATFORM_ZIP[key]
}

export function getRealesrganZipUrl(platform: NodeJS.Platform = process.platform): string {
  const file = getRealesrganZipFileName(platform)
  return `https://github.com/xinntao/Real-ESRGAN/releases/download/${REALESRGAN_NCNN_RELEASE}/${file}`
}

export function isTransientDownloadError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (
    code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || code === 'ECONNREFUSED'
    || code === 'ENOTFOUND'
    || code === 'EAI_AGAIN'
    || code === 'EPIPE'
    || code === 'ECONNABORTED'
    || code === 'UND_ERR_SOCKET'
    || code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /TLS|socket disconnected|socket hang up|network|ECONNRESET|ETIMEDOUT|timed out/i.test(message)
}

export function needsTagAiUpscale(
  width: number,
  height: number,
  targetWidth: number,
): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false
  }
  return Math.max(width, height) < targetWidth
}

export function targetHeightFor(width: number, height: number, targetWidth: number): number {
  const aspect = width / height
  if (!Number.isFinite(aspect) || aspect <= 0) return targetWidth
  return Math.max(1, Math.round(targetWidth / aspect))
}
