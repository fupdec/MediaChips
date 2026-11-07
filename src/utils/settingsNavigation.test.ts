import {describe, expect, it} from 'vitest'
import {settingsMatchContext, highlightSettingsMatch, CORE_SETTINGS_TABS, SETTINGS_SECTIONS, resolveSettingsLocation, searchSettings, settingsPanelTab} from './settingsNavigation'
import en from '../i18n/en'
import ru from '../i18n/ru'
import {docs} from '../../shared/documentation/structure'

const message = (catalog: unknown, key: string): string => key.split('.').reduce((value: any, part) => value?.[part], catalog)

describe('settings navigation compatibility', () => {
  it.each([
    ['maintenance', 'generate_video_images', 'maintenance', 'settings-generate-video-images'],
    ['maintenance', 'detect_faces', 'maintenance', 'settings-detect-faces'],
    ['maintenance', 'clip_embedding_backfill', 'maintenance', 'settings-clip-embedding-backfill'],
    ['maintenance', 'clear_generated', 'database', 'settings-clear-generated-images'],
    ['general', 'video_player', 'viewing', 'settings-video-player'],
    ['general', 'video_preview', 'viewing', 'video_preview'],
    ['general', 'local_ai', 'processing', 'settings-local-ai'],
    ['appearance', 'appearance_image_viewer', 'viewing', 'settings-appearance-image-viewer'],
    ['appearance', 'appearance_sfw', 'general', 'settings-appearance-sfw'],
    ['library', 'parse_library_tags', 'library', 'settings-parse-library-tags'],
    ['files', 'bulk_paths', 'connections', 'settings-bulk-paths'],
    ['files', 'folder_tags', 'library', 'settings-folder-tags'],
    ['files', 'watched_folders', 'connections', 'settings-watched-folders'],
    ['database', 'find_duplicates', 'maintenance', 'settings-find-duplicates'],
    ['database', 'find_missing', 'maintenance', 'settings-find-missing-media'],
    ['database', 'backups', 'database', 'database_backups'],
    ['database', 'library_reset', 'database', 'settings-library-reset'],
    ['database', 'oshash_backfill', 'maintenance', 'settings-fingerprint-backfill'],
    ['database', 'content_hash_backfill', 'maintenance', 'settings-fingerprint-backfill'],
    ['connections', 'nas', 'connections', 'settings-nas'],
    ['plugins', 'adult_scraper', 'plugins', 'settings-adult-scraper'],
  ])('keeps %s / %s working', (oldTab, section, tab, elementId) => {
    expect(resolveSettingsLocation(oldTab, section)).toEqual({tab, elementId})
  })
  it.each([['files','connections'],['video','viewing'],['assignment','library'],['data_scraper','plugins'],['adult','plugins']])('supports the old %s tab', (oldTab, tab) => {
    expect(resolveSettingsLocation(oldTab).tab).toBe(tab)
  })
  it('resolves every canonical section and DOM anchor to its owner', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(resolveSettingsLocation('wrong', section.key)).toEqual({tab: section.tab, elementId: section.elementId})
      expect(resolveSettingsLocation('wrong', section.elementId)).toEqual({tab: section.tab, elementId: section.elementId})
    }
    expect(new Set(SETTINGS_SECTIONS.map(item => item.key)).size).toBe(SETTINGS_SECTIONS.length)
  })
  it('keeps every library preparation destination in maintenance', () => {
    for (const section of [
      'generate_video_images', 'generate_image_thumbs', 'oshash_backfill',
      'video_codec_backfill', 'clip_embedding_backfill', 'detect_faces',
      'find_duplicates', 'tag_image_ai_upscale', 'find_missing',
    ]) {
      expect(resolveSettingsLocation('database', section).tab, section).toBe('maintenance')
    }
  })
  it('groups all plugin panels under plugins', () => {
    expect(settingsPanelTab({tab:'plugins', sectionId:'settings-import-plex'})).toBe('plugins')
    expect(settingsPanelTab({tab:'plugins', sectionId:'settings-tmdb'})).toBe('plugins')
    for (const section of ['settings-adult-scraper', 'settings-tmdb', 'settings-import-plex', 'settings-import-emby', 'settings-import-jellyfin', 'settings-import-stash']) {
      expect(resolveSettingsLocation('processing', section)).toEqual({tab: 'plugins', elementId: section})
    }
    const panel = {pluginId:'custom', tab:'custom', sectionId:'custom-panel', componentKey:'Custom'}
    expect(resolveSettingsLocation('plugins','custom-panel',[panel])).toEqual({tab:'plugins',elementId:'custom-panel'})
  })
  it('keeps all public documentation IDs unique and settings links on the right tab', () => {
    const ids: string[] = []
    const walk = (items: Array<{id: string; navigate?: string; selector?: string[]; children?: any[]}>) => {
      for (const item of items) {
        ids.push(item.id)
        if (item.navigate?.startsWith('/settings?')) {
          const url = new URL(item.navigate, 'http://local')
          const location = resolveSettingsLocation(url.searchParams.get('tab') || '', url.searchParams.get('section') || '')
          expect(location.tab, item.id).toBe(url.searchParams.get('tab'))
          expect(item.selector?.find(selector => selector.startsWith('#settings-doc-tab-')),item.id).toBe(`#settings-doc-tab-${location.tab}`)
        }
        if (item.children) walk(item.children)
      }
    }
    walk(docs)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['settings.files','settings.general.local_ai','sets.tools.video_preview','database.backups.restore','data_scraper']))
  })
})

describe('settings search', () => {
  const items = (catalog: unknown) => SETTINGS_SECTIONS.map(section => ({
    section:section.key,tab:section.tab,title:message(catalog,section.titleKey),category:message(catalog,CORE_SETTINGS_TABS.find(tab=>tab.value===section.tab)!.labelKey),terms:[...section.searchKeys.map(key=>message(catalog,key)||''), ...(section.keywords || [])],
  }))
  it('indexes labels and descriptions in English and Russian', () => {
    for (const catalog of [en,ru]) for (const section of SETTINGS_SECTIONS) {
      expect(message(catalog,section.titleKey),section.key).toBeTypeOf('string')
      for (const key of section.searchKeys) expect(message(catalog,key),key).toBeTypeOf('string')
    }
    expect(searchSettings(items(en),'conversion resolution').map(item=>item.section)).toContain('video_player')
    expect(searchSettings(items(ru),'разрешение конвертации').map(item=>item.section)).toContain('video_player')
    expect(searchSettings(items(en),'Dropbox').map(item=>item.section)).toContain('sources')
    expect(searchSettings(items(en),'CLIP').map(item=>item.section)).toContain('clip_embedding_backfill')
    expect(searchSettings(items(ru),'слайд').map(item=>item.section)).toContain('appearance_image_viewer')
  })
  it('handles empty and multiword queries, case, accents and ё', () => {
    const sample=[{section:'test',tab:'test',title:'Ёж Café',category:'General',terms:['Password lock']}]
    expect(searchSettings(sample,'')).toEqual([])
    expect(searchSettings(sample,'   ')).toEqual([])
    expect(searchSettings(sample,'ЕЖ CAFE')).toHaveLength(1)
    expect(searchSettings(sample,'PASSWORD general')).toHaveLength(1)
    expect(searchSettings(sample,'unfindable')).toEqual([])
  })
})

describe('settings match highlighting', () => {
  it('highlights every matching substring and merges overlapping words', () => {
    expect(highlightSettingsMatch('preview previews', 'view preview')).toEqual([
      {text: 'preview', matched: true}, {text: ' ', matched: false},
      {text: 'preview', matched: true}, {text: 's', matched: false},
    ])
  })
  it('keeps original accents, case, Unicode and plugin text intact', () => {
    expect(highlightSettingsMatch('Ёж Café', 'еж cafe')).toEqual([
      {text: 'Ёж', matched: true}, {text: ' ', matched: false}, {text: 'Café', matched: true},
    ])
    const label = '<img src=x> Video'
    expect(highlightSettingsMatch(label, 'video').map(part => part.text).join('')).toBe(label)
    expect(highlightSettingsMatch('Video', '  ')).toEqual([{text: 'Video', matched: false}])
  })
})

it('shows the description matching all search words when available', () => {
  expect(settingsMatchContext({section:'player',tab:'viewing',title:'Player',category:'Viewing',
    terms:['Conversion quality','Maximum conversion resolution']}, 'conversion resolution')).toBe('Maximum conversion resolution')
})

it('skips context already shown in the result labels', () => {
  const item = {
    section: 'duplicates',
    tab: 'maintenance',
    title: 'Поиск дубликатов',
    category: 'Обслуживание',
    terms: ['  ПОИСК ДУБЛИКАТОВ  ', 'Обслуживание', 'Найдено несколько дубликатов'],
  }
  expect(settingsMatchContext(item, 'поиск дубли')).toBe('Найдено несколько дубликатов')
  expect(settingsMatchContext(item, 'обслуживание')).toBe('')
})
