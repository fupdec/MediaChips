export function sizeBasenameKey(filesize: number, basename: string): string {
  return `${Number(filesize) || 0}::${String(basename || '').toLowerCase()}`
}

export function addToSizeBasenameIndex<T>(
  index: Map<string, T[]>,
  filesize: number,
  basename: string,
  item: T,
): void {
  const key = sizeBasenameKey(filesize, basename)
  const bucket = index.get(key)
  if (bucket) bucket.push(item)
  else index.set(key, [item])
}
