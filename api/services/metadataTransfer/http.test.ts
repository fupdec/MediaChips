// @vitest-environment node
import express from 'express'
import type {Server} from 'node:http'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import registerMetadataTransfer from '../../routes/MetadataTransfer.routes'
let db: TestDb, server: Server, base: string
beforeEach(async () => {
  db = createTestDb('metadata-http')
  db.sqlite.exec("INSERT INTO media (path,name,rating,createdAt,updatedAt) VALUES ('/metadata.mp4','Movie',4,'x','x')")
  const app = express(); app.use(express.json()); registerMetadataTransfer(app, db)
  server = await new Promise((resolve, reject) => { const listener = app.listen(0,'127.0.0.1',(error?: Error) => error ? reject(error) : resolve(listener)); listener.once('error',reject) })
  base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api/metadata-transfer`
})
afterEach(async () => {
  if (server) await new Promise<void>(resolve => {server.closeAllConnections();server.close(() => resolve())})
  closeTestDb(db)
})
const post = (route:string, body:unknown) => fetch(`${base}/${route}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
describe('metadata transfer HTTP', () => {
  it('exports an attachment and enforces review plus conflict decisions', async () => {
    const response = await post('export',{mediaIds:[1]})
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('metadata.mediachips.json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const bundle = await response.json()
    bundle.media[0].rating = 2
    const preview = await (await post('preview',bundle)).json()
    expect(preview.conflicts[0].key).toBe('media:1')
    expect((await post('import',{bundle,token:preview.token,resolutions:{}})).status).toBe(409)
    expect(db.sqlite.prepare('SELECT rating FROM media').get()).toEqual({rating:4})
    expect((await post('import',{bundle,token:preview.token,resolutions:{'media:1':'replace'}})).status).toBe(200)
    expect(db.sqlite.prepare('SELECT rating FROM media').get()).toEqual({rating:2})
  })
  it('rejects malformed versions, types, selections and imports without preview', async () => {
    for (const mediaIds of [[],[0],[-1],['1'],[1.5]]) expect((await post('export',{mediaIds})).status).toBe(400)
    expect((await post('export',{mediaIds:[99999]})).status).toBe(400)
    const bundle = await (await post('export',{mediaIds:[1]})).json()
    expect((await post('preview',{...bundle,version:2})).status).toBe(400)
    bundle.media[0].favorite = 'false'
    expect((await post('preview',bundle)).status).toBe(400)
    expect((await post('import',{bundle})).status).toBe(400)
    expect((await post('sidecars',{mediaIds:[1],formats:['xml']})).status).toBe(400)
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM media').get()).toEqual({n:1})
  })
})
