import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, nextTick, type ComponentOptions} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import type {BrowseDirectoryEntry, BrowseDirectoryLoader} from '@/services/typedApi/browse'
import type {RemoteImportOptions} from '@/services/remoteImportOptions'

const mocks = vi.hoisted(() => ({
  listMediaServerLibraries: vi.fn(), streamMediaServerImport: vi.fn(),
  ensureCanImport: vi.fn(), get: vi.fn(), post: vi.fn(), parseTags: vi.fn(), refreshCount: vi.fn(), sync: vi.fn(), emit: vi.fn(),
}))
vi.mock('@/services/typedApi/imports', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/typedApi/imports')>()
  return {importsApi: {...actual.importsApi,
    listMediaServerLibraries: mocks.listMediaServerLibraries,
    streamMediaServerImport: mocks.streamMediaServerImport,
  }}
})
vi.mock('@/services/apiClient', () => ({apiClient: {get: mocks.get, post: mocks.post}}))
vi.mock('@/services/importPathAutoTag', () => ({parseAndAssignImportPathTags: mocks.parseTags}))
vi.mock('@/composable/itemsListSync', () => ({useItemsListSync: () => ({getItemsFromDb: mocks.sync})}))
vi.mock('@/utils/eventBus', () => ({useEventBus: () => ({emit: mocks.emit})}))
vi.mock('@/composable/useFilePreview', () => ({useFilePreview: () => ({preview: vi.fn()})}))
vi.mock('@/services/shellService', () => ({openExternal: vi.fn()}))
vi.mock('@/composable/useFreeLibraryGate', () => ({useFreeLibraryGate: () => ({
  ensureCanImportMedia: mocks.ensureCanImport, refreshLibraryCount: mocks.refreshCount,
  registered: {value: true}, grandfathered: {value: false}, libraryCount: {value: 0}, freeCap: 100,
})}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key, te: () => false})}))
vi.mock('./MediaFolderBrowser.vue', () => ({default: {}}))
vi.mock('./FilePreviewButton.vue', () => ({default: {}}))
vi.mock('./MediaImportOptions.vue', () => ({default: {}}))
vi.mock('./MediaImportSection.vue', () => ({default: {}}))
vi.mock('./SourceCatalogControls.vue', () => ({default: {}}))
vi.mock('./DialogOriginalOperations.vue', () => ({default: {}}))
vi.mock('@/components/elements/DialogHeader.vue', () => ({default: {}}))
vi.mock('@/components/ui/SettingsCategoryDivider.vue', () => ({default: {}}))
// Vuetify's template auto-imports include CSS; these tests only run source actions.
vi.mock('vuetify/lib/components/VCheckbox/index.mjs', () => ({VCheckbox: {}}))
vi.mock('vuetify/lib/components/VAlert/index.mjs', () => ({VAlert: {}}))
vi.mock('vuetify/lib/components/VBtn/index.mjs', () => ({VBtn: {}}))
vi.mock('vuetify/lib/components/VCard/index.mjs', () => ({VCard: {}, VCardText: {}}))
vi.mock('vuetify/lib/components/VDefaultsProvider/index.mjs', () => ({VDefaultsProvider: {}}))
vi.mock('vuetify/lib/components/VDialog/index.mjs', () => ({VDialog: {}}))
vi.mock('vuetify/lib/components/VExpansionPanel/index.mjs', () => ({VExpansionPanels: {}, VExpansionPanel: {}, VExpansionPanelText: {}}))
vi.mock('vuetify/lib/components/VGrid/index.mjs', () => ({VSpacer: {}}))
vi.mock('vuetify/lib/components/VIcon/index.mjs', () => ({VIcon: {}}))
vi.mock('vuetify/lib/components/VProgressCircular/index.mjs', () => ({VProgressCircular: {}}))
vi.mock('vuetify/lib/components/VProgressLinear/index.mjs', () => ({VProgressLinear: {}}))
vi.mock('vuetify/lib/components/VSelect/index.mjs', () => ({VSelect: {}}))
vi.mock('vuetify/lib/components/VSwitch/index.mjs', () => ({VSwitch: {}}))
vi.mock('vuetify/lib/components/VTextField/index.mjs', () => ({VTextField: {}}))
vi.mock('vuetify/lib/components/VTextarea/index.mjs', () => ({VTextarea: {}}))
vi.mock('vuetify/directives', () => ({Tooltip: {}}))

import NasSources from './NasSources.vue'
import GoogleDriveSource from './GoogleDriveSource.vue'
import WebVideoImport from './WebVideoImport.vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import SettingsImportPlex from '@mediachips/plugin-plex/components/SettingsImportPlex.vue'
import SettingsImportJellyfin from '@mediachips/plugin-jellyfin/components/SettingsImportJellyfin.vue'
import SettingsImportEmby from '@mediachips/plugin-emby/components/SettingsImportEmby.vue'

type SourceState = {
  selectedId?: string
  selectedPaths: string[]
  importOptions: RemoteImportOptions
  directoryLoader: BrowseDirectoryLoader
  onVisibleEntries: (entries: BrowseDirectoryEntry[]) => void
  batchErrors: Array<{path: string; message: string}>
  failures: Array<{path: string; message: string}>
  url: string
  canSubmit: boolean
  checkConnection: () => Promise<void>
  editConnection: () => void
  health: unknown
  batchStats: {found: number; added: number; duplicates: number; skipped: number; inLibrary: number}
  message: string
  draft: Record<string, unknown>
}
const mounted: ReturnType<typeof createApp>[] = []
// Exercise the real setup, lifecycle and exposed actions without rendering Vuetify.
function mountSource(source: unknown, props: Record<string, unknown> = {}) {
  const app = createApp({...source as ComponentOptions, render: () => null}, props)
  const vm = app.mount(document.createElement('div')) as unknown as {submit: () => Promise<void>; stop: () => void}
  mounted.push(app)
  const state = app._instance!.setupState as SourceState
  return {state, submit: () => vm.submit(), stop: () => vm.stop()}
}
const connection = {id: '11111111-1111-4111-8111-111111111111', name: 'NAS', root: '/Медиа',
  protocol: 'sftp', host: 'nas', port: 22, username: 'reader', hasCredentials: true}
const driveRoot = '/Google Drive'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.resetAllMocks()
  useAppStore().localhost = 'http://localhost:12321'
  mocks.ensureCanImport.mockResolvedValue(true)
  mocks.parseTags.mockResolvedValue(undefined)
  mocks.refreshCount.mockResolvedValue(undefined)
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/nas/connections') return {data: [connection]}
    if (url === '/api/drive/status') return {data: {authenticated: true}}
    throw new Error(`Unexpected request: ${url}`)
  })
})
afterEach(() => { for (const app of mounted.splice(0)) app.unmount() })

describe('embedded media server imports', () => {
  it.each([
    ['plex', SettingsImportPlex, 'token'],
    ['jellyfin', SettingsImportJellyfin, 'apiKey'],
    ['emby', SettingsImportEmby, 'apiKey'],
  ] as const)('requires an explicit library selection for %s', async (kind, component, credential) => {
    mocks.listMediaServerLibraries.mockResolvedValue({
      data: {ok: true, libraries: [{id: 'movies', name: 'Movies'}, {id: 'tv', name: 'TV'}]},
    })
    mocks.streamMediaServerImport.mockResolvedValue(undefined)
    const app = createApp({...component as ComponentOptions, render: () => null}, {embedded: true})
    const importer = app.mount(document.createElement('div')) as unknown as {canSubmit: boolean; submit: () => Promise<void>}
    mounted.push(app)
    const state = app._instance!.setupState
    state.baseUrl = 'http://media-server'
    state[credential] = 'test-key'
    await nextTick()
    await state.loadLibraries()
    expect(mocks.listMediaServerLibraries).toHaveBeenCalledWith(kind, {baseUrl: 'http://media-server', [credential]: 'test-key'})
    expect(importer.canSubmit).toBe(false)
    await importer.submit()
    expect(mocks.streamMediaServerImport).not.toHaveBeenCalled()

    state.selectedLibraryIds = ['movies']
    expect(importer.canSubmit).toBe(true)
    await importer.submit()
    expect(mocks.streamMediaServerImport).toHaveBeenCalledWith(
      kind, expect.objectContaining({libraryIds: ['movies']}), expect.anything(), expect.any(Function),
    )

    state.baseUrl = 'http://another-server'
    await nextTick()
    expect(importer.canSubmit).toBe(false)
  })
})

describe('remote source import actions', () => {
  it.each([
    {name: 'NAS', component: NasSources}, {name: 'Drive', component: GoogleDriveSource},
  ])('applies the shared media type filter to direct selections and nested $name folders', async ({component}) => {
    const nas = component === NasSources
    const source = mountSource(component, {extensions: 'mp4'})
    await nextTick()
    if (nas) await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    const root = nas ? '/Медиа' : driveRoot
    mocks.get.mockResolvedValue({data: nas ? {path: '', entries: [
      {name: 'Nested', path: 'Nested', isDirectory: true, size: 0},
      {name: 'Photo.JPG', path: 'Photo.JPG', isDirectory: false, size: 100},
    ]} : {files: [
      {id: 'nested-id', name: 'Nested', isFolder: true},
      {id: 'photo-id', name: 'Photo.JPG', isFolder: false, size: 100},
    ]}})
    const listing = await source.state.directoryLoader({path: root, extensions: 'mp4'})
    if (nas) source.state.onVisibleEntries(listing.entries)
    const photo = listing.entries.find(entry => entry.name === 'Photo.JPG')!
    expect(photo.addable).toBe(false)
    source.state.selectedPaths = [root, photo.path]
    source.state.importOptions = {...source.state.importOptions, parseTags: false}
    mocks.get.mockImplementation(async (url: string, config?: {params?: {path?: string}}) => {
      const nested = nas ? config?.params?.path === 'Nested' : url.endsWith('/nested-id')
      return {data: nas ? {path: nested ? 'Nested' : '', entries: nested ? [
        {name: 'Movie.MP4', path: 'Nested/Movie.MP4', isDirectory: false, size: 100},
        {name: 'Song.mp3', path: 'Nested/Song.mp3', isDirectory: false, size: 100},
      ] : [{name: 'Nested', path: 'Nested', isDirectory: true, size: 0}]} : {files: nested ? [
        {id: 'movie-id', name: 'Movie.MP4', isFolder: false, size: 100},
        {id: 'song-id', name: 'Song.mp3', isFolder: false, size: 100},
      ] : [{id: 'nested-id', name: 'Nested', isFolder: true}]}}
    })
    mocks.post.mockResolvedValue({data: nas
      ? {results: [{ok: true, path: 'Nested/Movie.MP4', id: 91, title: 'Movie.MP4', created: true}]}
      : {id: 91, title: 'Movie.MP4', created: true}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith(nas ? '/api/nas/import-batch' : '/api/drive/import',
      nas ? {connectionId: connection.id, paths: ['Nested/Movie.MP4']} : {fileId: 'movie-id'}, expect.anything())
    expect(mocks.parseTags).not.toHaveBeenCalled()
    expect(source.state.selectedPaths).toEqual([])
  })

  it.each([
    {code: 'network_error', status: 502}, {code: 'permission_denied', status: 403}, {code: 'auth_required', status: 409},
  ])('distinguishes $code during connection checks and recovers on retry', async ({code, status}) => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    mocks.get.mockRejectedValueOnce({response: {status, data: {code}}})
    await source.state.checkConnection()
    expect(source.state.health).toMatchObject({[connection.id]: {state: code}})
    expect(source.state.message).toBe(`remote_errors.${code}`)
    mocks.get.mockResolvedValueOnce({data: {path: '', entries: [], truncated: false}})
    await source.state.checkConnection()
    expect(source.state.health).toMatchObject({[connection.id]: {state: 'ready'}})
    expect(source.state.message).toBe('')
  })
  it('edits NAS credentials without passing public capabilities to strict configuration validation', async () => {
    mocks.get.mockResolvedValueOnce({data: [{...connection, capabilities: {view: true}}]})
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    source.state.editConnection()
    expect(source.state.draft).not.toHaveProperty('capabilities')
    expect(source.state.draft).not.toHaveProperty('id')
  })
  it('keeps a forbidden Drive folder visible as a permission failure instead of silently returning to root', async () => {
    const source = mountSource(GoogleDriveSource)
    await nextTick()
    mocks.get.mockRejectedValueOnce({response: {status: 403, data: {code: 'permission_denied'}}})
    await expect(source.state.directoryLoader({path: `${driveRoot}/private`})).rejects.toMatchObject({response: {status: 403}})
    expect(source.state.health).toBe('permission_denied')
    expect(mocks.get.mock.calls.filter(([url]) => url.startsWith('/api/drive/folders/'))).toHaveLength(1)
  })

  it('keeps the NAS selection when server settings refresh without changing the library', async () => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    source.state.selectedPaths = ['/Медиа/Кино.mp4']
    useAppStore().config = {...useAppStore().config}
    await nextTick()
    expect(source.state.selectedPaths).toEqual(['/Медиа/Кино.mp4'])
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })
  it('parses readable NAS paths and retains successes for retry when tagging fails', async () => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    const path = '/Медиа/Драма/Кино 1.mp4'
    source.state.selectedPaths = [path]
    mocks.post.mockResolvedValue({data: {results: [
      {ok: true, path: 'Драма/Кино 1.mp4', id: 51, title: 'Кино 1.mp4', created: true},
    ]}})
    mocks.parseTags.mockRejectedValueOnce(new Error('Tags unavailable'))
    await source.submit()
    expect(mocks.parseTags).toHaveBeenCalledWith([{path, mediaId: 51}], expect.anything())
    expect(source.state.selectedPaths).toEqual([path])
    expect(source.state.batchErrors).toEqual([{path: 'Драма/Кино 1.mp4', message: 'remote_errors.unknown'}])
    mocks.post.mockResolvedValue({data: {results: [
      {ok: true, path: 'Драма/Кино 1.mp4', id: 51, title: 'Кино 1.mp4', created: false},
    ]}})
    await source.submit()
    expect(source.state.selectedPaths).toEqual([])
    expect(mocks.parseTags).toHaveBeenCalledTimes(2)
  })

  it('honors exclusions and disabled parsing during NAS folder import', async () => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    source.state.onVisibleEntries([])
    source.state.selectedPaths = ['/Медиа']
    source.state.importOptions = {parseTags: false, excluded: 'Пропустить'}
    mocks.get.mockResolvedValue({data: {path: '', truncated: false, entries: [
      {name: 'Пропустить', path: 'Пропустить', isDirectory: true, size: 0},
      {name: 'Кино.mp4', path: 'Кино.mp4', isDirectory: false, size: 100},
    ]}})
    mocks.post.mockResolvedValue({data: {results: [{ok: true, path: 'Кино.mp4', id: 52, title: 'Кино.mp4', created: true}]}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledWith('/api/nas/import-batch',
      {connectionId: connection.id, paths: ['Кино.mp4']}, expect.anything())
    expect(mocks.parseTags).not.toHaveBeenCalled()
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('finishes tagging the active NAS batch on Stop and keeps the remaining files selected', async () => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    source.state.selectedPaths = Array.from({length: 11}, (_, index) => `/Медиа/${index}.mp4`)
    mocks.post.mockImplementationOnce(async (_url: string, body: {paths: string[]}) => {
      source.stop()
      return {data: {results: body.paths.map((path, index) => ({ok: true, path, id: index + 1, title: path, created: true}))}}
    })
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.parseTags.mock.calls[0][0]).toHaveLength(10)
    expect(source.state.selectedPaths).toEqual(['/Медиа/10.mp4'])
  })

  it('expands the current Drive folder, excludes names and parses actual file and folder names', async () => {
    const source = mountSource(GoogleDriveSource)
    await nextTick()
    mocks.get.mockResolvedValue({data: {files: [
      {id: 'folder-id', name: 'Драма', isFolder: true},
      {id: 'skip-id', name: 'Пропустить', isFolder: true},
    ]}})
    await source.state.directoryLoader({path: driveRoot})
    source.state.selectedPaths = [driveRoot]
    source.state.importOptions = {...source.state.importOptions, excluded: 'Пропустить'}
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/api/drive/folders/root') return {data: {files: [
        {id: 'folder-id', name: 'Драма', isFolder: true}, {id: 'skip-id', name: 'Пропустить', isFolder: true},
      ]}}
      if (url === '/api/drive/folders/folder-id') return {data: {files: [
        {id: 'file-id', name: 'Старое имя.mp4', isFolder: false, size: 100},
      ]}}
      throw new Error(`Excluded folder was requested: ${url}`)
    })
    mocks.post.mockResolvedValue({data: {id: 61, title: 'Новое имя.mp4', created: true}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/drive/import', {fileId: 'file-id'}, expect.anything())
    expect(mocks.parseTags).toHaveBeenCalledWith([{path: '/Драма/Новое имя.mp4', mediaId: 61}], expect.anything())
    expect(source.state.selectedPaths).toEqual([])
  })

  it('retains a Drive file on tag assignment failure and retries even if it is already imported', async () => {
    const source = mountSource(GoogleDriveSource)
    await nextTick()
    source.state.selectedPaths = [`${driveRoot}/file-id`]
    mocks.post.mockResolvedValue({data: {id: 61, title: 'Кино.mp4', created: false}})
    mocks.parseTags.mockRejectedValueOnce(new Error('Tags unavailable'))
    await source.submit()
    expect(source.state.selectedPaths).toEqual([`${driveRoot}/file-id`])
    expect(source.state.failures).toHaveLength(1)
    await source.submit()
    expect(source.state.selectedPaths).toEqual([])
    expect(mocks.parseTags).toHaveBeenCalledTimes(2)
  })

  it('imports Drive media without parsing when the option is disabled', async () => {
    const source = mountSource(GoogleDriveSource)
    await nextTick()
    source.state.selectedPaths = [`${driveRoot}/file-id`]
    source.state.importOptions = {...source.state.importOptions, parseTags: false}
    mocks.post.mockResolvedValue({data: {id: 61, title: 'Кино.mp4', created: true}})
    await source.submit()
    expect(source.state.selectedPaths).toEqual([])
    expect(mocks.parseTags).not.toHaveBeenCalled()
  })

  it('continues NAS batches after an unknown request outcome and retries only remaining paths', async () => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    const paths = Array.from({length: 21}, (_, index) => `/Медиа/${index}.mp4`)
    source.state.selectedPaths = paths
    mocks.post.mockRejectedValueOnce(new Error('Request timeout')).mockImplementation(async (_url, body: {paths: string[]}) => ({
      data: {results: body.paths.map(path => ({ok: true, path, id: 52, title: path, created: true}))},
    }))
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(3)
    expect(source.state.batchErrors).toHaveLength(10)
    expect(source.state.selectedPaths).toEqual(paths.slice(0, 10))
    expect(source.state.batchStats).toMatchObject({found: 21, added: 11})
    mocks.post.mockClear().mockImplementation(async (_url, body: {paths: string[]}) => ({
      // The timed-out request had already committed its cards.
      data: {results: body.paths.map(path => ({ok: true, path, id: 52, title: path, created: false}))},
    }))
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(source.state.selectedPaths).toEqual([])
    expect(source.state.batchStats).toMatchObject({added: 0, duplicates: 10})
  })

  it('isolates a pasted NAS path outside the connection root and imports the remaining file', async () => {
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    source.state.selectedPaths = ['/other/invalid.mp4', '/Медиа/good.mp4']
    mocks.post.mockResolvedValue({data: {results: [{ok: true, path: 'good.mp4', id: 52, title: 'good.mp4', created: true}]}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/nas/import-batch', {connectionId: connection.id, paths: ['good.mp4']}, expect.anything())
    expect(source.state.selectedPaths).toEqual(['/other/invalid.mp4'])
    expect(source.state.batchErrors).toHaveLength(1)
  })

  it('continues Drive files after a failure and retries only failed selections', async () => {
    const source = mountSource(GoogleDriveSource)
    await nextTick()
    source.state.selectedPaths = ['first', 'bad', 'last'].map(id => `${driveRoot}/${id}`)
    mocks.post.mockImplementation(async (_url, body: {fileId: string}) => {
      if (body.fileId === 'bad') throw new Error('Permission denied')
      return {data: {id: 61, title: `${body.fileId}.mp4`, created: body.fileId !== 'first'}}
    })
    await source.submit()
    expect(mocks.post.mock.calls.map(([, body]) => body.fileId)).toEqual(['first', 'bad', 'last'])
    expect(source.state.selectedPaths).toEqual([`${driveRoot}/bad`])
    expect(source.state.failures).toHaveLength(1)
    expect(source.state.batchStats).toMatchObject({found: 3, added: 1, duplicates: 1})
    mocks.post.mockClear().mockResolvedValue({data: {id: 62, title: 'Recovered.mp4', created: true}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/drive/import', {fileId: 'bad'}, expect.anything())
    expect(source.state.selectedPaths).toEqual([])
  })

  it('finishes tagging the active Drive batch on Stop, then resumes only remaining files', async () => {
    const source = mountSource(GoogleDriveSource)
    await nextTick()
    const names = ['a', 'b', 'c', 'd', 'e', 'last']
    source.state.selectedPaths = names.map(name => `${driveRoot}/${name}`)
    // Drive imports run five files at once; Stop lets that whole batch finish and holds back the rest.
    mocks.post.mockImplementation(async (_url: string, body: {fileId: string}) => {
      if (body.fileId === 'a') source.stop()
      const id = 60 + names.indexOf(body.fileId)
      return {data: {id, title: `${body.fileId}.mp4`, created: true}}
    })
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(5)
    expect(mocks.parseTags).toHaveBeenCalledWith(
      expect.arrayContaining([{path: '/a.mp4', mediaId: 60}, {path: '/e.mp4', mediaId: 64}]), expect.anything())
    expect(source.state.selectedPaths).toEqual([`${driveRoot}/last`])
    mocks.post.mockReset().mockResolvedValue({data: {id: 62, title: 'Last.mp4', created: true}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/drive/import', {fileId: 'last'}, expect.anything())
    expect(source.state.selectedPaths).toEqual([])
  })

  it.each([NasSources, GoogleDriveSource])('does not start a request after Stop during a capacity check', async component => {
    const source = mountSource(component)
    await nextTick()
    if (component === NasSources) await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    const path = component === NasSources ? '/Медиа/first.mp4' : `${driveRoot}/first`
    source.state.selectedPaths = [path]
    mocks.ensureCanImport.mockImplementationOnce(async () => { source.stop(); return true })
    await source.submit()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(source.state.selectedPaths).toEqual([path])
  })

  it('uses the pasted link slug for tags and keeps the URL available after a tagging error', async () => {
    const source = mountSource(WebVideoImport)
    const url = 'https://xhamster.com/videos/%D0%94%D1%80%D0%B0%D0%BC%D0%B0-test-abc123?tracking=ignore'
    source.state.url = url
    mocks.post.mockResolvedValue({data: {id: 71, title: 'Movie', created: true}})
    mocks.parseTags.mockRejectedValueOnce(new Error('Tags unavailable'))
    await source.submit()
    expect(mocks.parseTags).toHaveBeenCalledWith([{path: '/videos/Драма-test-abc123', mediaId: 71}], expect.anything())
    expect(source.state.url).toBe(url)
    await source.submit()
    expect(source.state.url).toBe('')
    // Only successful tagging requests a targeted card refresh.
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ids: [71], type: 'media'})
  })

  it('enables import and path tags for a video page from another site', async () => {
    const source = mountSource(WebVideoImport)
    source.state.url = 'https://www.xvideos.com/video123/Drama?utm_source=share'
    expect(source.state.canSubmit).toBe(true)
    mocks.post.mockResolvedValue({data: {id: 72, title: 'Drama', created: true}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledWith('/api/web-video/import', {url: 'https://www.xvideos.com/video123/Drama?utm_source=share'}, expect.anything())
    expect(mocks.parseTags).toHaveBeenCalledWith([{path: '/video123/Drama', mediaId: 72}], expect.anything())
    expect(source.state.url).toBe('')
  })

  it('ignores folder exclusions for links and lets users disable tag parsing', async () => {
    const source = mountSource(WebVideoImport)
    source.state.url = 'https://xhamster.com/videos/drama-test-abc123'
    source.state.importOptions = {parseTags: false, excluded: 'drama'}
    expect(source.state.canSubmit).toBe(true)
    mocks.post.mockResolvedValue({data: {id: 71, title: 'Movie', created: true}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.parseTags).not.toHaveBeenCalled()
  })

  it.each([
    {name: 'NAS', component: NasSources}, {name: 'Drive', component: GoogleDriveSource}, {name: 'link', component: WebVideoImport},
  ])('does not tag an in-flight $name import in a different library', async ({component}) => {
    const source = mountSource(component)
    await nextTick()
    if (component === NasSources) {
      await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
      source.state.selectedPaths = ['/Медиа/file.mp4']
    } else if (component === GoogleDriveSource) source.state.selectedPaths = [`${driveRoot}/file-id`]
    else source.state.url = 'https://xhamster.com/videos/drama-abc123'
    let finish!: (value: unknown) => void
    mocks.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const importing = source.submit()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    useAppStore().dbPath = '/different-library'
    await nextTick()
    finish({data: component === NasSources
      ? {results: [{ok: true, path: 'file.mp4', id: 81, title: 'Movie.mp4', created: true}]}
      : {id: 81, title: 'Movie.mp4', created: true}})
    await importing
    expect(mocks.parseTags).not.toHaveBeenCalled()
  })
})

describe('Pro gate on imports from existing NAS connections', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  async function mountWithSelection(config: Record<string, string>) {
    useAppStore().config = {proAccessSettled: '1', proFeaturesGrandfathered: '0', ...config} as never
    const source = mountSource(NasSources)
    await vi.waitFor(() => expect(source.state.selectedId).toBe(connection.id))
    source.state.selectedPaths = ['/Медиа/file.mp4']
    return source
  }

  it('blocks the import and opens the paywall once the trial has ended', async () => {
    const source = await mountWithSelection({proTrialStartedAt: daysAgo(40)})
    await source.submit()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(useDialogsStore().paywall).toMatchObject({show: true, feature: 'nas_sources'})
  })

  it('imports normally while the trial is running', async () => {
    const source = await mountWithSelection({proTrialStartedAt: daysAgo(5)})
    mocks.post.mockResolvedValue({data: {results: [{ok: true, path: 'file.mp4', id: 1, title: 'file.mp4', created: true}]}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(useDialogsStore().paywall.show).toBe(false)
  })

  it('imports normally for grandfathered installs', async () => {
    const source = await mountWithSelection({proFeaturesGrandfathered: '1', proTrialStartedAt: ''})
    mocks.post.mockResolvedValue({data: {results: [{ok: true, path: 'file.mp4', id: 1, title: 'file.mp4', created: true}]}})
    await source.submit()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })
})
