import { describe, expect, it, vi } from 'vitest'
import { validateBody, validateQuery } from './validateBody'
import {
  BulkMetaApplyRequestSchema,
  CreateTagsRequestSchema,
  FaceAssignRequestSchema,
  FaceMediaIdRequestSchema,
  FilterRowCreateRequestSchema,
  HomeMediaQuerySchema,
  MediaInPlaylistCreateRequestSchema,
  MediaTagCountQuerySchema,
  MetaInMediaTypeOrderRequestSchema,
  PathPayloadSchema,
  PinMetaAssignmentRequestSchema,
  PlaylistWriteRequestSchema,
  PluginUninstallRequestSchema,
  SettingUpdateRequestSchema,
  TagItemsRequestSchema,
  TagsInFolderLinkSchema,
  TagsInMediaBulkCreateRequestSchema,
  TagsInMediaLinkSchema,
  ValuesInMediaBulkCreateRequestSchema,
  WatchedFolderCreateRequestSchema,
} from '../../shared/schemas/requests'

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res
}

describe('validateBody', () => {
  it('passes parsed body to the next handler', () => {
    const middleware = validateBody(PathPayloadSchema)
    const req = { body: { path: '/media/video.mp4' } }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body).toEqual({ path: '/media/video.mp4' })
  })

  it('returns 400 with field errors when validation fails', () => {
    const middleware = validateBody(PathPayloadSchema)
    const req = { body: {} }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({
      message: 'Invalid request body',
      errors: expect.arrayContaining([
        expect.objectContaining({ path: 'path' }),
      ]),
    })
  })

  it('validates bulk meta apply payloads', () => {
    const middleware = validateBody(BulkMetaApplyRequestSchema)
    const req = {
      body: {
        itemType: 'media',
        itemIds: [1, 2],
        changes: [],
      },
    }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body.itemType).toBe('media')
    expect(req.body.itemIds).toEqual([1, 2])
  })

  it('rejects bulk meta apply without item ids', () => {
    const middleware = validateBody(BulkMetaApplyRequestSchema)
    const req = {
      body: {
        itemType: 'tag',
        itemIds: [],
      },
    }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('accepts playlist write payloads', () => {
    const middleware = validateBody(PlaylistWriteRequestSchema)
    const req = {body: {name: 'Watch later', favorite: true}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body).toEqual({name: 'Watch later', favorite: true})
  })

  it('requires setting update value', () => {
    const middleware = validateBody(SettingUpdateRequestSchema)
    const req = {body: {}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({
      message: 'Invalid request body',
      errors: expect.arrayContaining([
        expect.objectContaining({path: 'value'}),
      ]),
    })
  })

  it('requires watched folder path on create', () => {
    const middleware = validateBody(WatchedFolderCreateRequestSchema)
    const req = {body: {folder: {name: 'Videos'}, types: [1]}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('defaults watched folder types to an empty array', () => {
    const middleware = validateBody(WatchedFolderCreateRequestSchema)
    const req = {body: {folder: {path: '/media/shows'}}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body).toEqual({
      folder: {path: '/media/shows'},
      types: [],
    })
  })

  it('coerces tags-in-media link ids', () => {
    const middleware = validateBody(TagsInMediaLinkSchema)
    const req = {body: {mediaId: '12', tagId: '3', metaId: '7'}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body).toEqual({mediaId: 12, tagId: 3, metaId: 7})
  })

  it('rejects tags-in-media bulk create when body is not an array', () => {
    const middleware = validateBody(TagsInMediaBulkCreateRequestSchema)
    const req = {body: {mediaId: 1, tagId: 2, metaId: 3}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('accepts values-in-media bulk create arrays', () => {
    const middleware = validateBody(ValuesInMediaBulkCreateRequestSchema)
    const req = {body: [{mediaId: 1, metaId: 2, value: 'yes'}]}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body).toEqual([{mediaId: 1, metaId: 2, value: 'yes'}])
  })

  it('requires media and playlist ids when adding playlist media', () => {
    const middleware = validateBody(MediaInPlaylistCreateRequestSchema)
    const req = {body: {mediaId: 5}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires filter object when creating a filter row', () => {
    const middleware = validateBody(FilterRowCreateRequestSchema)
    const req = {body: {filterId: 1}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('accepts filter row create payloads', () => {
    const middleware = validateBody(FilterRowCreateRequestSchema)
    const req = {
      body: {
        filter: {param: 'favorite', type: 'boolean', cond: 'true', val: null, active: true, lock: false},
        filterId: '9',
        rowId: null,
      },
    }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body.filterId).toBe(9)
  })

  it('requires meta and media type ids for meta assignment', () => {
    const middleware = validateBody(PinMetaAssignmentRequestSchema)
    const req = {body: {metaId: 1}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires nested order data for meta-in-media-type updates', () => {
    const middleware = validateBody(MetaInMediaTypeOrderRequestSchema)
    const req = {body: {metaId: 1, mediaTypeId: 2, data: {order: '4'}}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.body).toEqual({metaId: 1, mediaTypeId: 2, data: {order: 4}})
  })

  it('requires plugin uninstall id', () => {
    const middleware = validateBody(PluginUninstallRequestSchema)
    const req = {body: {}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires folder path for tags-in-folder links', () => {
    const middleware = validateBody(TagsInFolderLinkSchema)
    const req = {body: {tagId: 1, metaId: 2}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires faceId and tagId for face assignment', () => {
    const middleware = validateBody(FaceAssignRequestSchema)
    const req = {body: {faceId: 1}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires mediaId when detecting faces', () => {
    const middleware = validateBody(FaceMediaIdRequestSchema)
    const req = {body: {force: true}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires at least one tag name on create', () => {
    const middleware = validateBody(CreateTagsRequestSchema)
    const req = {body: []}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('requires metaId for tag items listing', () => {
    const middleware = validateBody(TagItemsRequestSchema)
    const req = {body: {page: 1}}
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })
})

describe('validateQuery', () => {
  it('coerces numeric query params', () => {
    const middleware = validateQuery(HomeMediaQuerySchema)
    const req = { query: { continueLimit: '12', limit: '8' } }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.query.continueLimit).toBe(12)
    expect(req.query.limit).toBe(8)
  })

  it('requires media and tag ids for tag count queries', () => {
    const middleware = validateQuery(MediaTagCountQuerySchema)
    const req = { query: { mediaTypeId: '2', tagId: '9' } }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.query.mediaTypeId).toBe(2)
    expect(req.query.tagId).toBe(9)
  })

  it('returns 400 for invalid query params', () => {
    const middleware = validateQuery(MediaTagCountQuerySchema)
    const req = { query: { mediaTypeId: 'abc' } }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({
      message: 'Invalid request query',
    })
  })

  it('logs validation failures in development', () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const middleware = validateBody(PathPayloadSchema)
    const req = {
      method: 'POST',
      path: '/api/check-file',
      body: {},
    }
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(warn).toHaveBeenCalledWith(
      '[validateBody] Invalid request',
      expect.objectContaining({
        method: 'POST',
        path: '/api/check-file',
        source: 'body',
      }),
    )

    warn.mockRestore()
    process.env.NODE_ENV = previousNodeEnv
  })

  it('works when req.query is read-only (Express 5 router)', () => {
    const middleware = validateQuery(HomeMediaQuerySchema)
    const req = { query: { continueLimit: '12' } }
    Object.defineProperty(req, 'query', {
      get() {
        return { continueLimit: '12' }
      },
      configurable: true,
    })
    const res = createMockResponse()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.query.continueLimit).toBe(12)
  })
})
