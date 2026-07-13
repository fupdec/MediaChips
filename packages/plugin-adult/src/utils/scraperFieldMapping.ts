import type { AssignedMeta, Meta } from '@/types/stores'

export function resolveAssignmentMetaId(item: AssignedMeta): number | null {
  const metaId = item.metaId ?? item.meta?.id
  const parsed = Number(metaId)
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveAssignmentMetaType(
  item: AssignedMeta,
  metas: Meta[] = [],
): string {
  const directType = item.meta?.type
  if (directType) return String(directType)

  const metaId = resolveAssignmentMetaId(item)
  if (metaId == null) return ''

  const found = metas.find((meta) => Number(meta.id) === metaId)
  return String(found?.type || '')
}

export function canAssignMetaToScraperField(
  item: AssignedMeta,
  fieldType: string,
  metas: Meta[] = [],
): boolean {
  if (!fieldType) return false
  return resolveAssignmentMetaType(item, metas) === fieldType
}
