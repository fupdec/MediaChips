// @vitest-environment node
import {describe, expect, it, vi} from 'vitest'
import type {Request, Response} from 'express'
import {createCorsMiddleware} from './constants'

describe('media stream CORS', () => {
  const response = () => {
    const headers = new Map<string, string>()
    const res = {header: vi.fn((key: string, value: string) => headers.set(key, value)),
      sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn()} as unknown as Response
    return {res, headers}
  }

  it('allows a local player to request byte ranges and read buffer response headers', () => {
    const {res, headers} = response()
    const next = vi.fn()
    createCorsMiddleware()({method: 'OPTIONS', headers: {origin: 'http://localhost:3000',
      'access-control-request-headers': 'range'}} as Request, res, next)
    expect(res.sendStatus).toHaveBeenCalledWith(200)
    expect(headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    expect(headers.get('Access-Control-Allow-Headers')).toContain('Range')
    expect(headers.get('Access-Control-Expose-Headers')).toContain('Content-Range')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects an unrelated public origin', () => {
    const {res, headers} = response()
    const next = vi.fn()
    createCorsMiddleware()({method: 'GET', headers: {origin: 'https://unrelated.example'}} as Request, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a rebound foreign Host while LAN access is off', () => {
    const {res} = response()
    const next = vi.fn()
    createCorsMiddleware()({method: 'GET', headers: {host: 'evil.example:3000'}} as Request, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000'])('accepts loopback Host %s', (host) => {
    const {res} = response()
    const next = vi.fn()
    createCorsMiddleware()({method: 'GET', headers: {host}} as Request, res, next)
    expect(next).toHaveBeenCalled()
  })
})
