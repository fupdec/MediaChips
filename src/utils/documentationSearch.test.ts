import {describe, expect, it} from 'vitest'
import {buildDocumentationSearchItems} from './documentationSearch'
import {searchSettings, settingsMatchContext} from './settingsNavigation'

describe('documentation search', () => {
  const items = buildDocumentationSearchItems([{
    id: 'library', name: 'Библиотека', content: '<p>Обзор библиотеки</p>', children: [{
      id: 'backup', name: 'Резервные копии', subtitle: 'Защита данных',
      content: '<p>Начало работы</p><p>Восстановление &amp; перенос базы.</p>',
    }],
  }])
  it('finds article text and ancestor paths across multiple query words', () => {
    const results = searchSettings(items, 'библиотека восстановление')
    expect(results.map(item => item.section)).toEqual(['backup'])
    expect(results[0].category).toBe('Библиотека')
    expect(settingsMatchContext(results[0], 'восстановление')).toBe('Восстановление & перенос базы.')
  })
  it('includes parent articles and subtitles without indexing HTML tags', () => {
    expect(searchSettings(items, 'обзор').map(item => item.section)).toEqual(['library'])
    expect(searchSettings(items, 'защита').map(item => item.section)).toEqual(['backup'])
    expect(searchSettings(items, '</p>')).toEqual([])
    expect(searchSettings(items, '')).toEqual([])
  })
})
