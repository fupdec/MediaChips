import path from 'path'

/** True when `child` is `parent` or a path under it (zip-slip safe). */
export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
