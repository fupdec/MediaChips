// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {DOMParser} from '@xmldom/xmldom'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {metadataSidecars} from './sidecars'
import {exportMetadata, transferMetadata} from './service'
let db: TestDb, directory: string, original: string
beforeEach(() => {
  db = createTestDb('metadata-sidecars'); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-sidecars-'))
  original = path.join(directory, 'movie.mp4'); fs.writeFileSync(original, 'original bytes')
  db.sqlite.prepare("INSERT INTO media (path,name,rating,favorite,views,mediaCreatedAt,createdAt,updatedAt) VALUES (?, ?, 4,1,7,'2026-10-17T01:00:00Z','2026','2026')").run(original, 'Кино & <test>')
})
afterEach(() => { closeTestDb(db); fs.rmSync(directory, {recursive:true,force:true}) })
const id = () => (db.sqlite.prepare('SELECT id FROM media').get() as {id:number}).id

describe('metadata sidecars', () => {
  it('previews without writing and creates lossless JSON plus valid standard XML projections', () => {
    const preview = metadataSidecars(db,[id()],['json','xmp','nfo'])
    expect(preview.files.map(f => f.exists)).toEqual([false,false,false])
    expect(fs.readdirSync(directory)).toEqual(['movie.mp4'])
    const written = metadataSidecars(db,[id()],['json','xmp','nfo'],preview.token)
    expect(written.written).toBe(true)
    const json = JSON.parse(fs.readFileSync(original+'.mediachips.json','utf8'))
    expect(json.media).toEqual(exportMetadata(db,[id()]).media)
    expect(transferMetadata(db,json).conflicts).toEqual([])
    for (const ext of ['xmp','nfo']) {
      const errors: string[] = []
      const doc = new DOMParser({errorHandler: message => { errors.push(message) }}).parseFromString(fs.readFileSync(path.join(directory,`movie.${ext}`),'utf8'),'application/xml')
      expect(errors).toEqual([])
      const payload = doc.getElementsByTagNameNS('https://mediachips.app/ns/metadata/1.0/','metadata')[0].textContent!
      expect(JSON.parse(payload)).toEqual(json)
      if (ext === 'xmp') {
        expect(doc.getElementsByTagName('xmp:Rating')[0].textContent).toBe('4')
        expect(doc.getElementsByTagName('rdf:li')[0].textContent).toBe('Кино & <test>')
      } else {
        expect(doc.getElementsByTagName('userrating')[0].textContent).toBe('8')
        expect(doc.getElementsByTagName('playcount')[0].textContent).toBe('7')
      }
    }
    expect(fs.readFileSync(original,'utf8')).toBe('original bytes')
  })
  it('refuses existing files and stale plans without modifying anything', () => {
    fs.writeFileSync(path.join(directory,'movie.nfo'), 'existing metadata')
    const existing = metadataSidecars(db,[id()],['json','nfo'])
    expect(existing.files.some(f => f.exists)).toBe(true)
    expect(() => metadataSidecars(db,[id()],['json','nfo'],existing.token)).toThrow('already exist')
    expect(fs.existsSync(original+'.mediachips.json')).toBe(false)
    expect(fs.readFileSync(path.join(directory,'movie.nfo'),'utf8')).toBe('existing metadata')
    const stale = metadataSidecars(db,[id()],['xmp'])
    db.sqlite.exec('UPDATE media SET rating=2')
    expect(() => metadataSidecars(db,[id()],['xmp'],stale.token)).toThrow('plan changed')
  })
  it('rejects remote originals and sibling files with the same stem', () => {
    const other = path.join(directory,'movie.mkv'); fs.writeFileSync(other,'other')
    db.sqlite.prepare("INSERT INTO media (path,createdAt,updatedAt) VALUES (?,'x','x')").run(other)
    expect(() => metadataSidecars(db,[1,2],['nfo'])).toThrow('collide')
    db.sqlite.exec("UPDATE media SET path='nas://server/file' WHERE id=1")
    expect(() => metadataSidecars(db,[1],['json'])).toThrow('local original')
    expect(fs.readdirSync(directory).sort()).toEqual(['movie.mkv','movie.mp4'])
  })
})
