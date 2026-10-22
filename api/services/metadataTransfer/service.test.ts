// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {exportMetadata, transferMetadata} from './service'

let source: TestDb, target: TestDb
beforeEach(() => {
  source = createTestDb('metadata-source'); target = createTestDb('metadata-target')
  source.sqlite.exec(`
    INSERT INTO mediaTypes (id,name,type,createdAt,updatedAt) VALUES (1,'Videos','video','2026','2026');
    INSERT INTO meta (id,name,type,createdAt,updatedAt) VALUES
      (1,'Topics','array','2026','2026'), (2,'Count','number','2026','2026'),
      (3,'Seen','boolean','2026','2026'),(4,'Date','date','2026','2026'),
      (5,'Note','string','2026','2026'),(6,'Score','rating','2026','2026'),
      (7,'Details','array','2026','2026');
    UPDATE meta SET parentMetaId=1 WHERE id=7;
    INSERT INTO tags (id,name,metaId,parentTagId,createdAt,updatedAt,rating,favorite,color,synonyms) VALUES
      (1,'Parent',1,NULL,'2026','2026',3.5,1,'#abcdef','P'), (2,'Child',1,1,'2026','2026',0,0,NULL,NULL),
      (3,'Related',7,NULL,'2026','2026',0,0,NULL,NULL);
    INSERT INTO tagsInTags (parentTagId,tagId,metaId) VALUES (2,3,7);
    INSERT INTO valuesInTags (tagId,metaId,value) VALUES (3,3,'false'),(3,5,NULL);
    INSERT INTO media (id,path,name,mediaTypeId,rating,favorite,bookmark,createdAt,updatedAt) VALUES
      (1,'/test/film.mp4','Кино & <test>',1,4.5,1,'blue','2026','2026'),
      (2,'/test/unselected.mp4','Unselected',1,0,0,NULL,'2026','2026');
    INSERT INTO tagsInMedia (mediaId,tagId,metaId) VALUES (1,2,1);
    INSERT INTO marks (mediaId,tagId,type,time,end,text,icon) VALUES (1,3,'meta',0.5,123.25,'Метка & <test>','star');
    INSERT INTO valuesInMedia (mediaId,metaId,value) VALUES (1,2,'001.50'),(1,3,'0'),(1,4,'2026-10-17'),(1,5,''),(1,6,'4.5');
    INSERT INTO metaInMediaTypes (metaId,mediaTypeId,"order",show) VALUES (1,1,2,1),(2,1,3,1);
    INSERT INTO pinnedMetas (metaId,pinnedMetaId,"order",show) VALUES (1,3,1,1);
  `)
})
afterEach(() => { closeTestDb(source); closeTestDb(target) })
function importAll(db: TestDb, bundle = exportMetadata(source, [1])) {
  const preview = transferMetadata(db, bundle)
  return transferMetadata(db, bundle, {token: preview.token, resolutions: Object.fromEntries(preview.conflicts.map(c => [c.key, 'replace' as const]))})
}
function semantic(db: TestDb) {
  const bundle = exportMetadata(db, [Number((db.sqlite.prepare("SELECT id FROM media WHERE path='/test/film.mp4'").get() as {id: number}).id)])
  const field = (id: unknown) => bundle.fields.find(r => r.id === id)?.name
  const tag = (id: unknown) => bundle.tags.find(r => r.id === id)?.name
  return {
    media: bundle.media.map(({id: _id, mediaTypeId, ...r}) => ({...r,mediaType:bundle.mediaTypes.find(t => t.id === mediaTypeId)?.name})),
    assignments: bundle.fieldAssignments.map(({metaId,mediaTypeId,...r}) => ({...r,field:field(metaId),mediaType:bundle.mediaTypes.find(t => t.id === mediaTypeId)?.name})),
    fields: bundle.fields.map(({id: _id,parentMetaId,...r}) => ({...r,name:r.name,parent:field(parentMetaId)})).sort((a,b) => String(a['name']).localeCompare(String(b['name']))),
    tags: bundle.tags.map(({id: _id,metaId,parentTagId,...r}) => ({...r,name:r.name,field:field(metaId),parent:tag(parentTagId)})).sort((a,b) => String(a['name']).localeCompare(String(b['name']))),
    values: bundle.mediaValues.map(({mediaId: _mediaId,metaId,...r}) => ({...r,field:field(metaId)})).sort((a,b) => String(a.field).localeCompare(String(b.field))),
    tagValues: bundle.tagValues.map(({tagId,metaId,...r}) => ({...r,tag:tag(tagId),field:field(metaId)})),
    mediaTags: bundle.mediaTags.map(r => ({tag:tag(r.tagId),field:field(r.metaId)})).sort((a,b) => String(a.tag).localeCompare(String(b.tag))),
    tagTags: bundle.tagTags.map(r => ({parent:tag(r.parentTagId),tag:tag(r.tagId),field:field(r.metaId)})),
    marks: bundle.marks.map(({id: _id,mediaId: _mediaId,tagId,...r}) => ({...r,tag:tag(tagId)})),
    pins: bundle.fieldPins.map(({metaId,pinnedMetaId,...r}) => ({...r,field:field(metaId),pin:field(pinnedMetaId)})),
  }
}

describe('portable metadata', () => {
  it('exports only selected cards and preserves native types and exact storage', () => {
    const bundle = exportMetadata(source, [1])
    expect(bundle.media).toHaveLength(1)
    expect(bundle.media[0].favorite).toBe(true)
    expect(bundle.mediaValues.find(r => r.metaId === 2)).toMatchObject({value:1.5,rawValue:'001.50'})
    expect(bundle.mediaValues.find(r => r.metaId === 3)?.value).toBe(false)
    expect(bundle.mediaValues.find(r => r.metaId === 4)?.value).toBe('2026-10-17')
    expect(bundle.mediaValues.find(r => r.metaId === 5)?.value).toBe('')
  })
  it('round-trips all field types and graph edges into a database with colliding IDs', () => {
    target.sqlite.exec(`INSERT INTO meta (id,name,type,createdAt,updatedAt) VALUES (1,'Unrelated','string','x','x');
      INSERT INTO media (id,path,createdAt,updatedAt) VALUES (1,'/other','x','x');
      INSERT INTO tags (id,name,createdAt,updatedAt) VALUES (1,'Other','x','x');
      INSERT INTO mediaTypes (id,name,type,createdAt,updatedAt) VALUES (1,'Unrelated type','image','x','x');`)
    const before = semantic(source)
    const bundle = JSON.parse(JSON.stringify(exportMetadata(source,[1])))
    const preview = transferMetadata(target, bundle)
    expect(preview.conflicts).toEqual([])
    expect(target.sqlite.prepare('SELECT count(*) AS n FROM media').get()).toEqual({n:1})
    importAll(target,bundle)
    expect(semantic(target)).toEqual(before)
    const again = transferMetadata(target,bundle)
    expect(again.conflicts).toEqual([])
    importAll(target,bundle)
    expect(target.sqlite.prepare('SELECT count(*) AS n FROM marks').get()).toEqual({n:1})
  })
  it('previews conflicts without writes and requires a decision for every conflict', () => {
    importAll(target)
    target.sqlite.exec("UPDATE media SET rating=2; UPDATE valuesInMedia SET value='9' WHERE metaId=2")
    const bundle = exportMetadata(source,[1]), preview = transferMetadata(target,bundle)
    const conflict = preview.conflicts.find(c => c.entity === 'media')!
    expect(conflict.current.rating).toBe(2)
    expect(conflict.incoming.rating).toBe(4.5)
    expect(() => transferMetadata(target,bundle,{token:preview.token,resolutions:{}})).toThrow('Resolve every conflict')
    transferMetadata(target,bundle,{token:preview.token,resolutions:{[conflict.key]:'keep'}})
    expect(target.sqlite.prepare('SELECT rating FROM media').get()).toEqual({rating:2})
    importAll(target,bundle)
    expect(semantic(target)).toEqual(semantic(source))
  })
  it('materializes inherited folder chips when transferring to a new library', () => {
    source.sqlite.exec("INSERT INTO folderPaths (id,path,createdAt,updatedAt) VALUES (1,'/test','x','x'); INSERT INTO tagsInFolders (folderId,tagId,metaId) VALUES (1,1,1)")
    const bundle = exportMetadata(source,[1])
    expect(bundle.mediaTags).toContainEqual({mediaId:1,tagId:1,metaId:1})
    expect(transferMetadata(source,bundle).conflicts).toEqual([])
    importAll(target,bundle)
    expect(semantic(target)).toEqual(semantic(source))
    const removed = structuredClone(bundle); removed.mediaTags = removed.mediaTags.filter(r => r.tagId !== 1)
    const preview = transferMetadata(source,removed)
    expect(preview.conflicts.some(c => c.entity === 'media' && c.blocked)).toBe(true)
    expect(() => importAll(source,removed)).toThrow('Resolve every conflict')
  })
  it('preserves marks in Trash when replacing active marks', () => {
    importAll(target)
    target.sqlite.exec("INSERT INTO marks (mediaId,type,time,deletedAt) VALUES (1,'bookmark',20,'2026-01-01'); UPDATE media SET rating=2")
    importAll(target)
    expect(target.sqlite.prepare("SELECT count(*) AS n FROM marks WHERE deletedAt IS NOT NULL").get()).toEqual({n:1})
    expect(target.sqlite.prepare("SELECT count(*) AS n FROM marks WHERE deletedAt IS NULL").get()).toEqual({n:1})
  })
  it('rejects stale previews, incompatible fields, corrupt types, cycles and dangling references atomically', () => {
    importAll(target)
    const bundle = exportMetadata(source,[1]), preview = transferMetadata(target,bundle)
    target.sqlite.exec('UPDATE media SET rating=1')
    expect(() => transferMetadata(target,bundle,{token:preview.token,resolutions:{}})).toThrow('Library changed')
    target.sqlite.exec("UPDATE meta SET type='string' WHERE name='Count'")
    const blocked = transferMetadata(target,bundle)
    expect(blocked.conflicts.some(c => c.blocked)).toBe(true)
    expect(() => importAll(target,bundle)).toThrow('Resolve every conflict')
    const corrupted = structuredClone(bundle); corrupted.mediaValues[0].value = true
    expect(() => transferMetadata(target,corrupted)).toThrow('Value type')
    const dangling = structuredClone(bundle); dangling.marks[0].tagId = 99999
    expect(() => transferMetadata(target,dangling)).toThrow('Dangling')
    const cycle = structuredClone(bundle); cycle.fields[0].parentMetaId = cycle.fields[0].id
    expect(() => transferMetadata(target,cycle)).toThrow('Cycle')
    const version = {...bundle,version:99}
    expect(() => transferMetadata(target,version)).toThrow()
  })
})
