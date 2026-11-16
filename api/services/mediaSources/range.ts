export function parseSourceRange(header: string | undefined, size: number): {start: number; end: number; partial: boolean} | null {
  if (!Number.isSafeInteger(size) || size < 0) return null
  if (!header) return {start: 0, end: size - 1, partial: false}
  const match = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2]) || size === 0) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null
  return {start, end, partial: true}
}
