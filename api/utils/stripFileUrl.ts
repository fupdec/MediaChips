/** Convert file:// URLs to filesystem paths for media lookups. */
export function stripFileUrl(value: string): string {
  let result = String(value || '').trim()
  if (!/^file:/i.test(result)) return result

  try {
    result = decodeURIComponent(result)
  } catch {
    // keep undecoded path
  }

  result = result.replace(/^file:\/\/\/?/i, '')
  result = result.replace(/^localhost\//i, '')

  // file:///C:/video.mp4 → /C:/video.mp4 on some platforms
  if (/^\/[A-Za-z]:[\\/]/.test(result)) {
    result = result.slice(1)
  }

  return result
}
