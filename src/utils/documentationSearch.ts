import {stripDocHtml} from '@shared/docRetrieval'
import type {SettingsSearchItem} from './settingsNavigation'

interface SearchableDocumentation {
  id: string
  name?: string
  title?: string
  subtitle?: string
  description?: string
  content?: string
  children?: SearchableDocumentation[]
}

/** Index localized articles, including articles which also contain child sections. */
export function buildDocumentationSearchItems(nodes: SearchableDocumentation[], path: string[] = []): SettingsSearchItem[] {
  return nodes.flatMap(node => {
    const title = node.name || node.title || node.id
    // Keep paragraphs separate so previews show the matching passage, even deep in an article.
    const passages = (node.content || '').split(/<\/(?:p|li|h[1-6]|tr)>|<br\s*\/?>/i).map(stripDocHtml).filter(Boolean)
    return [{
      section: node.id,
      tab: 'documentation',
      title,
      category: path.join(' › '),
      terms: [node.subtitle || '', node.description || '', ...passages],
    }, ...buildDocumentationSearchItems(node.children || [], [...path, title])]
  })
}
