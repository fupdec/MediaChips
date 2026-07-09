export function isLikelyExternalFileDrag(event: Pick<DragEvent, 'dataTransfer'> | null | undefined): boolean {
  const transfer = event?.dataTransfer
  if (!transfer) return false

  if (transfer.files?.length) return true

  for (const item of Array.from(transfer.items || [])) {
    if (item.kind === 'file') return true
  }

  const types = Array.from(transfer.types || []).map((type) => type.toLowerCase())
  if (!types.length) return true

  if (
    types.includes('files')
    || types.includes('application/x-moz-file')
    || types.includes('text/uri-list')
  ) {
    return true
  }

  if (types.every((type) => type === 'text/plain' || type === 'text/html')) {
    return false
  }

  return false
}
