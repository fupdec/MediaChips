import {describe, expect, it, vi} from 'vitest'
import type {Express} from 'express'
import {registerRemotePlaybackSpeed} from './remotePlaybackSpeed'

describe('remote playback byte accounting', () => {
  it('combines Range responses and counts final chunks without counting errors', () => {
    let middleware: any, status: any
    registerRemotePlaybackSpeed({get: (_path: string, handler: unknown) => {status = handler}, use: (_path: string, handler: unknown) => {middleware = handler}} as unknown as Express)
    const id = '12345678-1234-1234-1234-123456789abc'
    const send = (code: number) => {
      const res = {statusCode: code, write: vi.fn((_chunk: Buffer) => false), end: vi.fn((_chunk: Buffer) => {})}
      middleware({method: 'GET', path: '/nas/media/1/stream', query: {playbackTransfer: id}}, res, vi.fn())
      expect(res.write(Buffer.alloc(100))).toBe(false)
      res.end(Buffer.alloc(50))
    }
    send(206); send(206); send(403)
    const json = vi.fn()
    status({params: {id}}, {setHeader: vi.fn(), json})
    expect(json).toHaveBeenCalledWith({bytes: 300})
  })
  it('continues accounting when a stalled response resumes after expiry', () => {
    let middleware: any, status: any
    registerRemotePlaybackSpeed({get: (_path: string, handler: unknown) => {status = handler}, use: (_path: string, handler: unknown) => {middleware = handler}} as unknown as Express)
    const id = '12345678-1234-1234-1234-123456789abc'
    const res = {statusCode: 206, write: vi.fn((_chunk: Buffer) => true), end: vi.fn((_chunk: Buffer) => {})}
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      middleware({method: 'GET', path: '/nas/media/1/stream', query: {playbackTransfer: id}}, res, vi.fn())
      res.write(Buffer.alloc(100))
      clock.mockReturnValue(62_000)
      const json = vi.fn()
      status({params: {id}}, {setHeader: vi.fn(), json})
      expect(json).toHaveBeenLastCalledWith({bytes: 0})
      res.write(Buffer.alloc(50))
      status({params: {id}}, {setHeader: vi.fn(), json})
      expect(json).toHaveBeenLastCalledWith({bytes: 150})
    } finally { clock.mockRestore() }
  })

})
