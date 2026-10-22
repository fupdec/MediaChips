// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb} from '../../db/testUtils/createTestDb'
import {createCloudAccounts} from './accounts'
import {createCloudAdapter} from './providers'
import {importCloudFile} from './library'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
it.each(['onedrive', 'dropbox'] as const)('%s imports Unicode video/audio/image idempotently in an isolated library', async provider => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cloud-import-'))
  const fixture = createTestDb('cloud-import'), db = {...fixture, path: directory}
  try {
    const manager = createCloudAccounts(path.join(directory, 'vault'))
    const account = manager.create(db, {provider, name: 'Acceptance', clientId: 'fixture', redirectUri: 'http://localhost:12331/api/cloud-accounts/oauth/callback'})
    for (const [kind, ext, mime] of [['video', 'mp4', 'video/mp4'], ['audio', 'mp3', 'audio/mpeg'], ['image', 'png', 'image/png']] as const) {
      createMediaTypesRepository(db.drizzle).create({name: kind, type: kind})
      const key = `id:文件-${kind}`, name = `Приёмка 🎬.${ext}`
      const adapter = createCloudAdapter(provider, async () => 'fixture', async () => ({status: 200, headers: {}, data: {
        id: key, name, size: 10, file: {mimeType: mime}, '.tag': 'file', rev: 'v1', cTag: 'v1',
      }}))
      const first = await importCloudFile(db, account.id, key, adapter)
      const repo = createMediaRepository(db.drizzle)
      repo.updateById(first.id, {name: 'Моё название', rating: 5})
      expect(await importCloudFile(db, account.id, key, adapter)).toMatchObject({id: first.id, created: false, title: 'Моё название'})
      expect(repo.findById(first.id)).toMatchObject({rating: 5, basename: name})
    }
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM media').get()).toEqual({count: 3})
  } finally { closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) }
})
