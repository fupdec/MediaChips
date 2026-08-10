/** Build `"Name (copy)"`, `"Name (copy 2)"`, … until `isTaken` returns false. */
export function allocateCopyName(
  baseName: string,
  isTaken: (candidate: string) => boolean,
  fallback = 'Untitled',
): string {
  const trimmed = String(baseName || '').trim() || fallback
  const first = `${trimmed} (copy)`
  if (!isTaken(first)) return first

  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${trimmed} (copy ${n})`
    if (!isTaken(candidate)) return candidate
  }

  return `${trimmed} (copy ${Date.now()})`
}
