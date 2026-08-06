/** Parse face/marker timestamps like HH:MM:SS, MM:SS, or raw seconds. */
export function parseFaceTimestampSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const parts = String(value).trim().split(':').map((part) => Number(part))
  if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
    return parts[0] * 60 + parts[1]
  }
  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : null
}
