/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {eq} from 'drizzle-orm'
import {closeDrizzleClient, createDrizzleClient} from '../../db/client'
import {bootstrapDatabase} from '../../db/migrationRunner'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMetaRepository} from '../../db/repositories/meta'
import {createTagsRepository} from '../../db/repositories/tags'
import {createTagsInMediaRepository} from '../../db/repositories/tagsInMedia'
import {createMarksRepository} from '../../db/repositories/marks'
import {playlists} from '../../db/schema/playlists'
import {mediaInPlaylists} from '../../db/schema/mediaInPlaylists'
import {nowIso} from '../../db/utils/timestamps'
import type {ApiDb} from '../../types/db'
import {importLibraryIntoActive} from './importLibrary'

async function bootstrapLibrary(root: string, id: string) {
  const dir = path.join(root, id)
  fs.mkdirSync(dir, {recursive: true})
  const dbPath = path.join(dir, 'db.sqlite')
  await bootstrapDatabase(dbPath)
  const conn = createDrizzleClient(dbPath)
  return {dir, dbPath, conn}
}

describe('importLibraryIntoActive', () => {
  let root: string
  let source: Awaited<ReturnType<typeof bootstrapLibrary>>
  let target: Awaited<ReturnType<typeof bootstrapLibrary>>
  let targetDb: ApiDb

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-library-merge-'))
    source = await bootstrapLibrary(root, 'source')
    target = await bootstrapLibrary(root, 'target')
    targetDb = {
      path: target.dir,
      path_databases: root,
      config: {id: 'target', name: 'Target', active: true},
      drizzle: target.conn.drizzle,
      sqlite: target.conn.sqlite,
    }
  })

  afterEach(() => {
    closeDrizzleClient(source.conn)
    closeDrizzleClient(target.conn)
    fs.rmSync(root, {recursive: true, force: true})
  })

  function seedSharedMetaAndTag(conn: ReturnType<typeof createDrizzleClient>, tagName: string) {
    const metaRepo = createMetaRepository(conn.drizzle)
    const tagsRepo = createTagsRepository(conn.drizzle)
    const mediaTypes = createMediaTypesRepository(conn.drizzle).findByType('video')
    const meta = metaRepo.create({
      type: 'array',
      name: 'Performers',
      favorite: true,
    })
    const [tag] = tagsRepo.bulkCreate([{name: tagName, metaId: meta.id}])
    return {meta, tag, videoTypeId: mediaTypes?.id ?? null}
  }

  it('enriches matched media and creates missing media with tags/playlists/marks', async () => {
    const sourceSeed = seedSharedMetaAndTag(source.conn, 'Alice')
    const targetSeed = seedSharedMetaAndTag(target.conn, 'Alice')

    const sourceMedia = createMediaRepository(source.conn.drizzle)
    const targetMedia = createMediaRepository(target.conn.drizzle)
    const stamp = nowIso()

    // Shared path media in both DBs
    const sharedSource = source.conn.drizzle.insert(
      (await import('../../db/schema/media')).media,
    ).values({
      path: '/videos/shared.mp4',
      basename: 'shared.mp4',
      name: 'shared',
      ext: 'mp4',
      filesize: 100,
      oshash: 'hash-shared',
      mediaTypeId: sourceSeed.videoTypeId,
      createdAt: stamp,
      updatedAt: stamp,
    }).returning().get()

    const sharedTarget = target.conn.drizzle.insert(
      (await import('../../db/schema/media')).media,
    ).values({
      path: '/videos/shared.mp4',
      basename: 'shared.mp4',
      name: 'shared',
      ext: 'mp4',
      filesize: 100,
      mediaTypeId: targetSeed.videoTypeId,
      createdAt: stamp,
      updatedAt: stamp,
    }).returning().get()

    createTagsInMediaRepository(source.conn.drizzle).bulkCreate([{
      mediaId: sharedSource.id,
      tagId: sourceSeed.tag.id,
      metaId: sourceSeed.meta.id,
    }])

    createMarksRepository(source.conn.drizzle).bulkCreate([{
      type: 'bookmark',
      text: 'Intro',
      time: 12,
      end: null,
      tagId: sourceSeed.tag.id,
      mediaId: sharedSource.id,
    }])

    // Media only in source → should be created
    const onlySource = source.conn.drizzle.insert(
      (await import('../../db/schema/media')).media,
    ).values({
      path: '/videos/only-source.mp4',
      basename: 'only-source.mp4',
      name: 'only-source',
      ext: 'mp4',
      filesize: 200,
      contentHash: 'content-only',
      mediaTypeId: sourceSeed.videoTypeId,
      createdAt: stamp,
      updatedAt: stamp,
    }).returning().get()

    createTagsInMediaRepository(source.conn.drizzle).bulkCreate([{
      mediaId: onlySource.id,
      tagId: sourceSeed.tag.id,
      metaId: sourceSeed.meta.id,
    }])

    const playlist = source.conn.drizzle.insert(playlists).values({
      name: 'Favorites',
      favorite: true,
      createdAt: stamp,
      updatedAt: stamp,
    }).returning().get()

    source.conn.drizzle.insert(mediaInPlaylists).values({
      mediaId: sharedSource.id,
      playlistId: playlist.id,
      order: 0,
    }).run()
    source.conn.drizzle.insert(mediaInPlaylists).values({
      mediaId: onlySource.id,
      playlistId: playlist.id,
      order: 1,
    }).run()

    // Thumb asset for created media
    const thumbsDir = path.join(source.dir, 'media/videos/thumbs')
    fs.mkdirSync(thumbsDir, {recursive: true})
    fs.writeFileSync(path.join(thumbsDir, `${onlySource.id}.jpg`), 'thumb')

    const result = await importLibraryIntoActive(targetDb, 'source')

    expect(result.ok).toBe(true)
    expect(result.mediaMatched).toBeGreaterThanOrEqual(1)
    expect(result.mediaCreated).toBeGreaterThanOrEqual(1)
    expect(result.tagsCreated).toBe(0) // Alice already exists by name

    const matchedLinks = createTagsInMediaRepository(target.conn.drizzle)
      .findAllByMediaId(sharedTarget.id)
    expect(matchedLinks.some((link) => link.tagId === targetSeed.tag.id)).toBe(true)

    const created = targetMedia.findByPathVariants(['/videos/only-source.mp4'])
    expect(created).toBeTruthy()
    expect(created?.contentHash).toBe('content-only')

    const createdLinks = createTagsInMediaRepository(target.conn.drizzle)
      .findAllByMediaId(created!.id)
    expect(createdLinks.length).toBeGreaterThanOrEqual(1)

    const marks = createMarksRepository(target.conn.drizzle).findAllForVideo(sharedTarget.id)
    expect(marks.some((mark) => mark.text === 'Intro')).toBe(true)

    const targetPlaylists = target.conn.drizzle.select().from(playlists).all()
    expect(targetPlaylists.some((p) => p.name === 'Favorites')).toBe(true)

    const copiedThumb = path.join(target.dir, 'media/videos/thumbs', `${created!.id}.jpg`)
    expect(fs.existsSync(copiedThumb)).toBe(true)

    // unused guard
    void sourceMedia
  })

  it('does not duplicate tags with the same normalized name', async () => {
    seedSharedMetaAndTag(source.conn, 'Bob')
    seedSharedMetaAndTag(target.conn, 'Bob')

    const result = await importLibraryIntoActive(targetDb, 'source')
    expect(result.tagsCreated).toBe(0)

    const tags = createTagsRepository(target.conn.drizzle).findAllRaw()
      .filter((tag) => tag.name.toLowerCase() === 'bob')
    expect(tags).toHaveLength(1)
  })

  it('stops cleanly when aborted', async () => {
    seedSharedMetaAndTag(source.conn, 'Carol')
    let calls = 0
    const result = await importLibraryIntoActive(
      targetDb,
      'source',
      {},
      undefined,
      () => {
        calls += 1
        return calls > 2
      },
    )
    expect(result.ok).toBe(true)
    expect(result.aborted).toBe(true)
  })

  it('rejects importing the active library into itself', async () => {
    await expect(importLibraryIntoActive(targetDb, 'target')).rejects.toThrow(/itself/i)
  })
})
