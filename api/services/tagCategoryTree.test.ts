/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import {eq} from 'drizzle-orm'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {tags} from '../db/schema/tags'
import {nowIso} from '../db/utils/timestamps'
import {
  TagCategoryTreeError,
  assertMetaIsTagLeaf,
  collectTagSubtreeIds,
  reparentMeta,
  reparentTag,
} from './tagCategoryTree'

function stamp() {
  const at = nowIso()
  return {createdAt: at, updatedAt: at}
}

describe('tagCategoryTree', () => {
  const dbs: Array<ReturnType<typeof createTestDb>> = []

  afterEach(() => {
    while (dbs.length) {
      closeTestDb(dbs.pop()!)
    }
  })

  function db() {
    const created = createTestDb('tag-category-tree')
    dbs.push(created)
    return created
  }

  it('reparents tags, rejects cycles, and expands subtrees', () => {
    const {drizzle} = db()
    const category = drizzle.insert(meta).values({
      type: 'array',
      name: 'Studios',
      ...stamp(),
    }).returning().get()

    const parent = drizzle.insert(tags).values({
      name: 'Network',
      metaId: category.id,
      ...stamp(),
    }).returning().get()
    const child = drizzle.insert(tags).values({
      name: 'Site A',
      metaId: category.id,
      ...stamp(),
    }).returning().get()
    const grand = drizzle.insert(tags).values({
      name: 'Site A Extra',
      metaId: category.id,
      ...stamp(),
    }).returning().get()

    drizzle.transaction((tx) => {
      reparentTag(tx, child.id, parent.id)
      reparentTag(tx, grand.id, child.id)
    })

    expect(drizzle.select().from(tags).where(eq(tags.id, child.id)).get()?.parentTagId).toBe(parent.id)
    expect(collectTagSubtreeIds(drizzle as never, [parent.id]).sort()).toEqual(
      [parent.id, child.id, grand.id].sort(),
    )

    expect(() => {
      drizzle.transaction((tx) => {
        reparentTag(tx, parent.id, grand.id)
      })
    }).toThrow(TagCategoryTreeError)
  })

  it('blocks tags on a parent category and media assignment to groups', () => {
    const {drizzle} = db()
    const group = drizzle.insert(meta).values({
      type: 'array',
      name: 'People',
      ...stamp(),
    }).returning().get()
    const leaf = drizzle.insert(meta).values({
      type: 'array',
      name: 'Performers',
      parentMetaId: group.id,
      ...stamp(),
    }).returning().get()

    expect(() => {
      drizzle.transaction((tx) => {
        assertMetaIsTagLeaf(tx, group.id)
      })
    }).toThrow(TagCategoryTreeError)

    drizzle.transaction((tx) => {
      assertMetaIsTagLeaf(tx, leaf.id)
    })

    drizzle.insert(tags).values({
      name: 'Alice',
      metaId: leaf.id,
      ...stamp(),
    }).run()

    expect(() => {
      drizzle.transaction((tx) => {
        reparentMeta(tx, leaf.id, group.id)
      })
    }).not.toThrow()

    drizzle.insert(metaInMediaTypes).values({
      metaId: leaf.id,
      mediaTypeId: 1,
    }).run()

    const other = drizzle.insert(meta).values({
      type: 'array',
      name: 'Directors',
      ...stamp(),
    }).returning().get()

    expect(() => {
      drizzle.transaction((tx) => {
        reparentMeta(tx, other.id, leaf.id)
      })
    }).toThrow(TagCategoryTreeError)
  })
})
