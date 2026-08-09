import {isChapterMark} from '../../shared/markIcons'
import type {
  MarkLike,
  MarkSortKey,
  MarkSortValue,
} from '../types/markItems'

export function normalizeMark(mark: MarkLike): MarkLike {
  const json = {...mark} as MarkLike

  if (json.media && !json.medium) {
    json.medium = json.media
  }

  return json
}

export function matchesMarkTypeFilter(mark: MarkLike, types: Array<number | string>) {
  if (!types.length) return false

  if (mark.type === 'favorite' && types.includes('favorite')) return true

  const wantsChapter = types.includes('chapter') || types.includes('scene')
  const wantsBookmark = types.includes('bookmark')
  if (wantsChapter && isChapterMark(mark)) return true
  if (
    wantsBookmark
    && mark.type === 'bookmark'
    && !isChapterMark(mark)
  ) {
    return true
  }

  if (mark.type === 'meta') {
    const metaId = mark.tag?.metaId
    return types.some((type) => Number(type) === Number(metaId))
  }

  return false
}

export function matchesMarkSearch(mark: MarkLike, search: string) {
  if (!search) return true

  const query = search.toLowerCase().trim()
  const fields = [
    mark.text,
    mark.medium?.name,
    mark.medium?.basename,
    mark.tag?.name,
  ]

  return fields.some((value) => value && String(value).toLowerCase().includes(query))
}

export function getMarkSortValue(mark: MarkLike, sortBy: MarkSortKey | string): MarkSortValue {
  switch (sortBy) {
    case 'videoName':
      return (mark.medium?.name || mark.medium?.basename || '').toLowerCase()
    case 'type':
      return mark.type || ''
    case 'tagName':
      return (mark.tag?.name || '').toLowerCase()
    case 'id':
      return Number(mark.id) || 0
    case 'time':
    default:
      return Number(mark.time) || 0
  }
}

export function compareMarksForSort(
  a: MarkLike,
  b: MarkLike,
  sortBy: MarkSortKey | string,
  sortDir: 'asc' | 'desc' | string = 'desc',
): number {
  const direction = sortDir === 'asc' ? 1 : -1
  const aVal = getMarkSortValue(a, sortBy)
  const bVal = getMarkSortValue(b, sortBy)

  if (typeof aVal === 'string' || typeof bVal === 'string') {
    return String(aVal).localeCompare(String(bVal), undefined, {sensitivity: 'base'}) * direction
  }

  if (aVal === bVal) return (Number(a.id) || 0) - (Number(b.id) || 0)
  return (aVal < bVal ? -1 : 1) * direction
}

export function sortMarksList(
  items: MarkLike[],
  sortBy: MarkSortKey | string = 'time',
  sortDir: 'asc' | 'desc' | string = 'desc',
  shuffleFn: (items: MarkLike[]) => MarkLike[] = (list) => [...list],
): MarkLike[] {
  if (sortBy === 'shuffle') {
    return shuffleFn(items)
  }
  return [...items].sort((a, b) => compareMarksForSort(a, b, sortBy, sortDir))
}
