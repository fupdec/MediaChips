import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppWebSocket } from '../types/websockets'
import type { Request } from 'express'

const {
  watch,
  mockWatcher,
  fullSync,
  refreshDbPaths,
  getReports,
  reset,
  setFolders,
} = vi.hoisted(() => {
  const mockWatcher = {
    on: vi.fn(),
    close: vi.fn(),
    add: vi.fn(),
  }

  return {
    watch: vi.fn(() => mockWatcher),
    mockWatcher,
    fullSync: vi.fn().mockResolvedValue(undefined),
    refreshDbPaths: vi.fn().mockResolvedValue(undefined),
    getReports: vi.fn().mockReturnValue([{folder: {path: '/media'}, files: []}]),
    reset: vi.fn(),
    setFolders: vi.fn(),
  }
})

vi.mock('chokidar', () => ({
  default: {
    watch,
  },
}))

vi.mock('./watcherSync', () => ({
  WatcherSyncEngine: vi.fn(function WatcherSyncEngine() {
    return {
      fullSync,
      refreshDbPaths,
      getReports,
      reset,
      setFolders,
      applyFileEvent: vi.fn().mockReturnValue(false),
    }
  }),
}))

import { createWatcherWsHandler } from './watcherWsHandler'

type OutboundMessage = Record<string, unknown>

type MockWebSocket = AppWebSocket & {
  messages: OutboundMessage[]
  emit: (event: string, ...args: unknown[]) => Promise<void>
}

function createMockWebSocket(): MockWebSocket {
  const listeners = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>()

  const ws: MockWebSocket = {
    readyState: 1,
    messages: [],
    send(data: string) {
      ws.messages.push(JSON.parse(data) as OutboundMessage)
    },
    close: vi.fn(),
    on(event: string, listener: (...args: unknown[]) => void) {
      const current = listeners.get(event) || []
      current.push(listener)
      listeners.set(event, current)
    },
    async emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) || []) {
        await listener(...args)
      }
    },
  }

  return ws
}

function triggerWatcherEvent(event: string, ...args: unknown[]) {
  const handler = mockWatcher.on.mock.calls.find(([name]) => name === event)?.[1] as
    | ((...handlerArgs: unknown[]) => void | Promise<void>)
    | undefined

  if (!handler) {
    throw new Error(`Watcher handler for "${event}" was not registered`)
  }

  return handler(...args)
}

describe('createWatcherWsHandler', () => {
  const db = {drizzle: {}} as never
  const req = {} as Request
  const folders = [{
    path: '/media/movies',
    types: [{id: 1, extensions: 'mp4'}],
  }]

  beforeEach(() => {
    vi.clearAllMocks()
    mockWatcher.on.mockImplementation(function mockOn(this: typeof mockWatcher) {
      return this
    })
    fullSync.mockResolvedValue(undefined)
    refreshDbPaths.mockResolvedValue(undefined)
    getReports.mockReturnValue([{folder: {path: '/media/movies'}, files: []}])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts chokidar and sends file reports after ready', async () => {
    const ws = createMockWebSocket()
    createWatcherWsHandler(db)(ws, req)

    await ws.emit('message', JSON.stringify({
      type: 'start',
      folders,
      extensions: {'/media/movies': ['mp4']},
    }))

    expect(watch).toHaveBeenCalledWith(['/media/movies/**/*.mp4'], expect.any(Object))
    expect(refreshDbPaths).toHaveBeenCalled()
    await triggerWatcherEvent('ready')
    expect(fullSync).toHaveBeenCalledWith(folders)
    expect(ws.messages.some((message) => message.type === 'scanStart')).toBe(true)
    expect(ws.messages.some((message) => message.type === 'scanComplete')).toBe(true)
    expect(ws.messages.some((message) => message.type === 'files')).toBe(true)
    expect(ws.messages[ws.messages.length - 1]?.type).toBe('scanComplete')
  })

  it('stops the watcher and sends closed', async () => {
    const ws = createMockWebSocket()
    createWatcherWsHandler(db)(ws, req)

    await ws.emit('message', JSON.stringify({
      type: 'start',
      folders,
      extensions: {'/media/movies': ['mp4']},
    }))

    await ws.emit('message', JSON.stringify({type: 'stop'}))

    expect(mockWatcher.close).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
    expect(ws.messages[ws.messages.length - 1]).toEqual({type: 'closed'})
  })

  it('refreshes the database when folder config is unchanged', async () => {
    const ws = createMockWebSocket()
    createWatcherWsHandler(db)(ws, req)

    await ws.emit('message', JSON.stringify({
      type: 'start',
      folders,
      extensions: {'/media/movies': ['mp4']},
    }))
    await triggerWatcherEvent('ready')

    vi.clearAllMocks()
    getReports.mockReturnValue([{folder: {path: '/media/movies'}, files: []}])

    await ws.emit('message', JSON.stringify({
      type: 'update',
      folders,
      extensions: {'/media/movies': ['mp4', 'mkv']},
    }))

    expect(refreshDbPaths).toHaveBeenCalled()
    expect(setFolders).toHaveBeenCalledWith(folders)
    expect(watch).not.toHaveBeenCalled()
    expect(ws.messages[ws.messages.length - 1]).toEqual({
      type: 'files',
      data: [{folder: {path: '/media/movies'}, files: []}],
    })
  })

  it('ignores invalid JSON without crashing', async () => {
    const ws = createMockWebSocket()
    createWatcherWsHandler(db)(ws, req)

    await ws.emit('message', '{bad-json')

    expect(watch).not.toHaveBeenCalled()
    expect(ws.messages).toEqual([])
  })
})
