import {stripHtmlTags} from '../../shared/stripHtml'

export type MarkForChapterTitle = {
  type?: string | null
  text?: string | null
  time?: number | null
  tagId?: number | null
  'tag.name'?: string | null
  tag?: {name?: string | null} | null
}

export function chapterTitleFromMark(mark: MarkForChapterTitle): string {
  const tagName = mark['tag.name'] || mark.tag?.name
  if (tagName) return stripHtmlTags(String(tagName))

  const type = String(mark.type || '').toLowerCase()
  if (type === 'favorite') return 'Favorite'
  if (type === 'bookmark') {
    const text = mark.text ? stripHtmlTags(String(mark.text)) : ''
    return text || 'Bookmark'
  }

  if (mark.text) {
    const text = stripHtmlTags(String(mark.text))
    if (text) return text
  }

  if (type === 'meta' || mark.tagId) return 'Mark'
  if (type) return type.charAt(0).toUpperCase() + type.slice(1)
  return 'Mark'
}
