// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {createMediaRepository} from '../db/repositories/media'
import {createFilterRowsRepository} from '../db/repositories/filterRows'
import {createSavedFiltersRepository} from '../db/repositories/savedFilters'
import createFilterRowController from '../controllers/FilterRow.controller'
import type {ApiRequest, ApiResponse} from '../types/http'
import {loadSavedFilterRows, getSavedFilterPlaylistSummary} from './savedFilterMedia'
import type {ApiDb, FilterLike} from '../types/db'
import {applyBulkMetaEdit} from './bulkMetaEdit'
import {loadMediaItems, loadFilteredMediaIds, getFilteredMediaSummary} from './mediaItemsLoader'
import {filterItems} from './filterItems'
import {ensureSearchFtsIndex} from '../db/searchFts'
import {searchGlobal} from './globalSearch'
import {listCatalogSources, markCatalogSourceDisconnected} from './mediaCatalogSources'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {nasMediaPath} from '../../shared/remoteMedia'
import type {ParsedItem} from '../../app/types/items'

const nas = '11111111-1111-4111-8111-111111111111'
const filter = (param: string | number, val: unknown, type = 'array', cond = 'in'): FilterLike => ({active: true, param, type, cond, val})

describe('remote metadata and catalog search', () => {
  let fixture: TestDb
  let db: ApiDb
  const network = vi.fn(() => { throw new Error('Sources are offline') })
  beforeEach(() => {
    fixture = createTestDb('catalog-sources')
    db = {...fixture, path: fixture.dbPath}
    invalidateMediaDerivedCaches()
    vi.stubGlobal('fetch', network)
    fixture.sqlite.exec(`
      INSERT INTO mediaTypes (id, type, name, createdAt, updatedAt) VALUES (1, 'video', 'Videos', '2026-01-01', '2026-01-01');
      INSERT INTO meta (id, type, name, createdAt, updatedAt) VALUES
        (1, 'array', 'Tags', '2026-01-01', '2026-01-01'),
        (2, 'string', 'Description', '2026-01-01', '2026-01-01'),
        (3, 'rating', 'Score', '2026-01-01', '2026-01-01');
      INSERT INTO tags (id, metaId, name, createdAt, updatedAt) VALUES (1, 1, 'Expedition', '2026-01-01', '2026-01-01');
      INSERT INTO sourceConnections (id, provider, config, credentialRef, createdAt) VALUES
        ('${nas}', 'nas', '{"name":"Studio NAS","host":"private.test"}', 'secret-reference', '2026-01-01'),
        ('google-drive', 'gdrive', '{"name":"Archive Drive"}', 'private-drive-ref', '2026-01-01');
    `)
    const repo = createMediaRepository(fixture.drizzle)
    repo.create({path: '/local.mp4', name: 'Local', mediaTypeId: 1, filesize: 100})
    repo.create({path: nasMediaPath(nas, 'movie.mp4'), name: 'NAS movie', mediaTypeId: 1, filesize: 200})
    repo.create({path: 'gdrive://drive-file', name: 'Drive movie', mediaTypeId: 1, filesize: 300})
    fixture.sqlite.exec(`INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version, availability, lastVerifiedAt) VALUES
      ('nas-location', 2, '${nas}', 'movie.mp4', 'v1', 'available', '2026-01-01'),
      ('drive-location', 3, 'google-drive', 'drive-file', 'v1', 'available', '2026-01-01');`)
    ensureSearchFtsIndex(fixture.sqlite)
  })
  afterEach(() => {
    expect(network).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    network.mockClear()
    invalidateMediaDerivedCaches()
    closeTestDb(fixture)
  })
  const items = (filters: FilterLike[] = [], options: Record<string, unknown> = {}) => loadMediaItems(db, {mediaTypeId: 1, filters, ...options})

  it('edits chips, descriptions and ratings in a mixed selection after disconnecting both sources', async () => {
    markCatalogSourceDisconnected(db, nas)
    markCatalogSourceDisconnected(db, 'google-drive')
    await applyBulkMetaEdit(db, {
      itemType: 'media', itemIds: [1, 2, 3],
      changes: [
        {metaId: 1, metaType: 'array', editType: 3, value: [1]},
        {metaId: 2, metaType: 'string', editType: 2, value: 'Offline expedition notes'},
        {metaId: 3, metaType: 'rating', editType: 2, value: 4.5},
      ],
      presetChanges: [{field: 'rating', editType: 2, value: 4}, {field: 'favorite', editType: 2, value: true}],
    })
    invalidateMediaDerivedCaches()
    const result = await items([
      filter(1, [1]), filter(2, 'expedition', 'string', 'like'), filter(3, 4.5, 'rating', '='),
      filter('rating', 4, 'number', '='), filter('favorite', true, 'boolean', '='),
      filter('availability', ['unavailable']), filter('source', ['nas', 'gdrive']),
    ])
    expect(result.items.map(row => row.id)).toEqual([3, 2])
    expect(result.totalFiltered).toBe(2)
    expect(result.totalFilesize).toBe(500)
    expect(result.items[1]).toMatchObject({sourceNames: 'Studio NAS', availability: 'unavailable', tags: [{tagId: 1, metaId: 1}]})
    expect((await items()).items).toHaveLength(3)
  })

  it('finds individually edited names, descriptions and assigned tags using the existing database search', async () => {
    markCatalogSourceDisconnected(db, nas)
    markCatalogSourceDisconnected(db, 'google-drive')
    const repo = createMediaRepository(fixture.drizzle)
    repo.updateById(2, {name: 'Offline aurora', bookmark: 'Northern lights notes'})
    await applyBulkMetaEdit(db, {itemType: 'media', itemIds: [2, 3], changes: [{metaId: 1, metaType: 'array', editType: 2, value: [1]}]})
    expect((await searchGlobal(db, 'aurora')).media.map(row => 'id' in row ? row.id : undefined)).toEqual([2])
    expect((await searchGlobal(db, 'Northern', {deep: true})).media.map(row => 'id' in row ? row.id : undefined)).toEqual([2])
    expect((await searchGlobal(db, 'Expedition')).media.map(row => 'id' in row ? row.id : undefined).sort()).toEqual([2, 3])
    expect(repo.findById(2)?.bookmark).toBe('Northern lights notes')
  })

  it('applies source filters to pagination, select-all ids and saved-filter summaries', async () => {
    const filters = [filter('source', ['nas', 'gdrive'])]
    expect((await items(filters, {page: 1, limit: 1})).items.map(row => row.id)).toEqual([3])
    expect((await items(filters, {page: 2, limit: 1})).items.map(row => row.id)).toEqual([2])
    const ids = await loadFilteredMediaIds(db, {mediaTypeId: 1, filters})
    expect(ids.ids).toEqual([3, 2])
    expect(ids.totalFiltered).toBe(2)
    expect(await getFilteredMediaSummary(db, {mediaTypeId: 1, filters})).toMatchObject({count: 2, previewIds: [3, 2]})
    expect((await items([filter('source', [`connection:${nas}`])])).items.map(row => row.id)).toEqual([2])
    expect((await items([filter('source', ['nas'], 'array', 'not in')])).items.map(row => row.id)).toEqual([3, 1])
    expect((await items([filter('source', ['nas']), filter('source', ['local'])], {filtersJoin: 'or'})).totalFiltered).toBe(2)
  })

  it('persists and reloads source and availability filters through the existing controller and saved-view loader', async () => {
    markCatalogSourceDisconnected(db, nas)
    const saved = createSavedFiltersRepository(fixture.drizzle).create({name: 'Offline NAS', mediaTypeId: 1})
    const controller = createFilterRowController(db)
    const saveRow = async (row: FilterLike, rowId?: number) => {
      const res = {status: vi.fn().mockReturnThis(), send: vi.fn(), sendStatus: vi.fn()}
      await controller.create({body: {filter: row, filterId: saved.id, rowId}} as ApiRequest, res as unknown as ApiResponse)
      expect(res.status).toHaveBeenCalledWith(201)
      return res.send.mock.calls[0][0] as {id: number; val: string}
    }
    const source = await saveRow(filter('source', [`connection:${nas}`]))
    const availability = await saveRow(filter('availability', ['unavailable']))
    const hydrated = await loadSavedFilterRows(db, saved.id)
    expect(hydrated.map(row => row.val)).toEqual([[`connection:${nas}`], ['unavailable']])
    expect((await items(hydrated)).items.map(row => row.id)).toEqual([2])
    expect(await getSavedFilterPlaylistSummary(db, saved.id)).toMatchObject({count: 1, previewIds: [2]})
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM tagsInFilterRows').get()).toEqual({count: 0})
    await saveRow(filter('source', ['gdrive']), source.id)
    const res = {status: vi.fn().mockReturnThis(), send: vi.fn(), sendStatus: vi.fn()}
    controller.update({params: {id: String(availability.id)}, body: {val: ['available']}} as unknown as ApiRequest, res as unknown as ApiResponse)
    expect(res.sendStatus).toHaveBeenCalledWith(200)
    expect(createFilterRowsRepository(fixture.drizzle).findById(source.id)?.val).toBe('["gdrive"]')
    expect((await items(await loadSavedFilterRows(db, saved.id))).items.map(row => row.id)).toEqual([3])
  })

  it('keeps unverified local and legacy remote paths unknown and searchable', async () => {
    const repo = createMediaRepository(fixture.drizzle)
    repo.create({path: nasMediaPath('22222222-2222-4222-8222-222222222222', 'legacy.mp4'), name: 'Legacy', mediaTypeId: 1})
    repo.create({path: 'https://xhamster.com/videos/video-abc123', name: 'Web', mediaTypeId: 1})
    invalidateMediaDerivedCaches()
    expect((await items([filter('availability', ['unknown'])])).items.map(row => row.id)).toEqual([5, 4, 1])
    expect((await items([filter('source', ['nas'])])).items.map(row => row.id)).toEqual([4, 2])
    expect((await items([filter('source', ['web'])])).items.map(row => row.id)).toEqual([5])
  })

  it('uses every retained location of a merged card and avoids duplicate results', async () => {
    fixture.sqlite.exec(`INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version, availability) VALUES
      ('alternative', 2, 'google-drive', 'alternative-file', 'v1', 'unknown')`)
    markCatalogSourceDisconnected(db, nas)
    expect((await items([filter('source', ['gdrive'])])).items.map(row => row.id)).toEqual([3, 2])
    expect((await items([filter('source', [`connection:${nas}`]), filter('availability', ['unknown'])])).items.map(row => row.id)).toEqual([2])
    fixture.sqlite.exec("UPDATE mediaLocations SET availability = 'available' WHERE id = 'alternative'")
    invalidateMediaDerivedCaches()
    expect((await items([filter('availability', ['available'])])).totalFiltered).toBe(2)
    markCatalogSourceDisconnected(db, 'google-drive')
    expect((await items([filter('availability', ['unavailable'])])).totalFiltered).toBe(2)
  })

  it('keeps SQL and the legacy worker equivalent for catalog filters', async () => {
    markCatalogSourceDisconnected(db, nas)
    const all = (await items()).items as ParsedItem[]
    for (const param of ['source', 'availability']) {
      for (const cond of ['in', 'not in', 'in all', 'not in all', 'in only', 'is null', 'not null']) {
        for (const values of [[], param === 'source' ? ['nas', `connection:${nas}`] : ['unavailable']]) {
          const filters = [filter(param, values, 'array', cond)]
          const sql = (await items(filters)).items.map(row => row.id)
          const js = filterItems(filters, 'media', all, 'id', 'desc', false).map(row => row.id)
          expect(js).toEqual(sql)
        }
      }
    }
  })

  it('retains the local classification when a local card also has a remote original', async () => {
    fixture.sqlite.exec(`INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version, availability) VALUES
      ('local-alternative', 1, '${nas}', 'local-copy.mp4', 'v1', 'unavailable')`)
    invalidateMediaDerivedCaches()
    expect((await items([filter('source', ['local'])])).items.map(row => row.id)).toEqual([1])
    expect((await items([filter('source', ['nas']), filter('availability', ['unknown'])])).items.map(row => row.id)).toEqual([1])
  })

  it('exposes catalog connection labels without configuration or credential references', () => {
    const options = listCatalogSources(db)
    expect(options).toContainEqual({value: `connection:${nas}`, name: 'Studio NAS'})
    expect(JSON.stringify(options)).not.toMatch(/private.test|secret-reference|private-drive-ref/)
  })
})
