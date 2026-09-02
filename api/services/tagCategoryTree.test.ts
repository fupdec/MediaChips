/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {tags} from '../db/schema/tags'
import {nowIso} from '../db/utils/timestamps'
import {
  TagCategoryTreeError,
  assertMetaIsTagLeaf,
  reparentMeta,
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

  it('allows clearing parentMetaId on non-array meta fields', () => {
    const {drizzle} = db()
    const field = drizzle.insert(meta).values({
      type: 'string',
      name: 'Title',
      ...stamp(),
    }).returning().get()

    expect(() => {
      drizzle.transaction((tx) => {
        reparentMeta(tx, field.id, null)
      })
    }).not.toThrow()

    const category = drizzle.insert(meta).values({
      type: 'array',
      name: 'Tags',
      ...stamp(),
    }).returning().get()

    expect(() => {
      drizzle.transaction((tx) => {
        reparentMeta(tx, field.id, category.id)
      })
    }).toThrow(TagCategoryTreeError)
  })
})
