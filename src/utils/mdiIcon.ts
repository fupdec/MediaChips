/** Icons for tasks/notifications are stored without the `mdi-` prefix; UI adds it. */
export function normalizeMdiIconName(
  icon: string | null | undefined,
  fallback = 'information-outline',
): string {
  const raw = String(icon || '').trim()
  if (!raw) return fallback
  const normalized = raw.replace(/^mdi-/i, '').trim()
  return normalized || fallback
}

export function mdiIcon(
  icon: string | null | undefined,
  fallback = 'information-outline',
): string {
  return `mdi-${normalizeMdiIconName(icon, fallback)}`
}
