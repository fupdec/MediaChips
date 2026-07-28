export function isLikelyExternalFileDrag(event: Pick<DragEvent, 'dataTransfer'> | null | undefined): boolean {
  const transfer = event?.dataTransfer
  if (!transfer) return false

  if (transfer.files?.length) return true

  for (const item of Array.from(transfer.items || [])) {
    if (item.kind === 'file') return true
  }

  const types = Array.from(transfer.types || []).map((type) => type.toLowerCase())
  // Electron often reports an empty type list while a real file drag is in progress.
  if (!types.length) return true

  if (types.includes('files') || types.includes('application/x-moz-file')) {
    return true
  }

  // text/uri-list alone can mean either OS file drops or in-app <a>/<router-link> drags.
  // DOM link drags almost always also expose text/html and/or text/plain — ignore those.
  // Real file drops usually include Files (handled above); keep bare uri-list as external.
  if (types.includes('text/uri-list')) {
    const looksLikeDomLinkDrag = types.includes('text/html') || types.includes('text/plain')
    return !looksLikeDomLinkDrag
  }

  if (types.every((type) => type === 'text/plain' || type === 'text/html')) {
    return false
  }

  return false
}
