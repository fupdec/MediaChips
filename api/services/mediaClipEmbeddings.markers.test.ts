// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import {expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {CLIP_EMBEDDING_INDEX_KEY, embedClipImageFile, getClipEmbeddingStatus} from './clipEmbeddingModel'
import {packFloat32Embeddings} from './clipEmbeddingMath'
import {findSimilarMarkerMoments} from './mediaClipEmbeddings'

vi.mock('./clipEmbeddingModel', async (importOriginal) => ({
  ...await importOriginal<typeof import('./clipEmbeddingModel')>(),
  embedClipImageFile: vi.fn(),
  getClipEmbeddingStatus: vi.fn(),
}))

it('uses the tagged marker thumbnail and skips marked, rejected and trashed moments', async () => {
  const {sqlite, drizzle, dbPath} = createTestDb('marker-moments')
  const libraryPath = fs.mkdtempSync(path.join(path.dirname(dbPath), 'marker-moments-'))
  try {
    sqlite.exec(`
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES (123, 'Example', 1, '2026-01-01', '2026-01-01');
      INSERT INTO media (id, path, mediaTypeId, deletedAt, createdAt, updatedAt) VALUES
        (101, '/first.mp4', 1, NULL, '2026-01-01', '2026-01-01'),
        (102, '/second.mp4', 1, NULL, '2026-01-01', '2026-01-01'),
        (103, '/third.mp4', 1, '2026-01-01', '2026-01-01', '2026-01-01');
      INSERT INTO videoMetadata (mediaId, duration) VALUES (101, 90), (102, 90), (103, 90);
      INSERT INTO marks (id, type, time, mediaId, tagId) VALUES (200, 'meta', 6, 101, 123);
    `)
    const thumb = path.join(libraryPath, 'media', 'videos', 'marks', '200.jpg')
    fs.mkdirSync(path.dirname(thumb), {recursive: true})
    fs.writeFileSync(thumb, 'mock thumbnail')
    vi.mocked(getClipEmbeddingStatus).mockReturnValue({status: 'loaded', model: 'clip'})
    vi.mocked(embedClipImageFile).mockResolvedValue([1, 0])

    const embeddings = packFloat32Embeddings([[1, 0], [0.8, 0.6], [0.8, -0.6], ...Array.from({length: 6}, () => [0, 1])])
    const insert = sqlite.prepare(`
      INSERT INTO mediaClipEmbeddings (mediaId, embedding, dims, model, updatedAt)
      VALUES (?, ?, 2, ?, '2026-01-01')
    `)
    for (const id of [101, 102, 103]) insert.run(id, embeddings, CLIP_EMBEDDING_INDEX_KEY)

    const db = {sqlite, drizzle, path: libraryPath}
    const result = await findSimilarMarkerMoments(db, 123, ['102:5'])
    expect(embedClipImageFile).toHaveBeenCalledWith(db, thumb)
    expect(result.hits).toEqual([{id: 101, time: 15}, {id: 102, time: 15}])

    sqlite.exec(`
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES (124, 'Other', 1, '2026-01-01', '2026-01-01');
      INSERT INTO marks (id, type, time, mediaId, tagId) VALUES
        (202, 'meta', 15, 101, 124),
        (203, 'meta', 15, 101, 124),
        (204, 'meta', 15, 102, 124),
        (205, 'meta', 16, 102, 124);
    `)
    for (const id of [202, 205]) {
      fs.writeFileSync(path.join(path.dirname(thumb), `${id}.jpg`), 'mock thumbnail')
    }
    const withThumbnails = await findSimilarMarkerMoments(db, 123, ['102:5'])
    expect(withThumbnails.hits).toEqual([{id: 101, time: 15, markId: 202}, {id: 102, time: 15}])

    const before = await findSimilarMarkerMoments(db, 123, [])
    expect(before.hits[0]).toEqual({id: 102, time: 5})
    const after = await findSimilarMarkerMoments(db, 123, ['101:15'])
    // Rejection affects a different video, not only the exact rejected timestamp.
    expect(after.hits.find(({id}) => id === 102)).toEqual({id: 102, time: 25})

    sqlite.exec("INSERT INTO marks (id, type, time, mediaId, tagId) VALUES (201, 'meta', 25, 102, 123)")
    const confirmed = await findSimilarMarkerMoments(db, 123, ['101:15'])
    expect(confirmed.seedCount).toBe(2)
    expect(confirmed.hits).not.toContainEqual({id: 102, time: 25})
  } finally {
    fs.rmSync(libraryPath, {recursive: true, force: true})
    closeTestDb({sqlite, dbPath})
  }
})
