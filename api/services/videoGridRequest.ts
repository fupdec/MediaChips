import path from 'path'

/** Resolve media id for interactive grid create from body.id or output filename. */
export function resolveMediaIdFromGridRequest(body: {
  id?: unknown
  output?: unknown
} | null | undefined): number | null {
  if (body?.id != null && body.id !== '') {
    const fromId = Number(body.id)
    if (Number.isFinite(fromId) && fromId > 0) return fromId
  }
  const output = String(body?.output || '')
  const match = /^(\d+)\.jpe?g$/i.exec(path.basename(output))
  if (!match) return null
  const fromOutput = Number(match[1])
  return Number.isFinite(fromOutput) && fromOutput > 0 ? fromOutput : null
}
