/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import type {Request, Response} from 'express'
import {createSlowRequestLogger, describeRoute, parseThresholdMs, startEventLoopLagMonitor} from './slowRequestLog'

function setup(thresholdMs: number, clock: {t: number}) {
  const log = vi.fn()
  const middleware = createSlowRequestLogger({thresholdMs, log, now: () => clock.t})
  const headers: Record<string, string> = {}
  const req = {method: 'GET', baseUrl: '/api', route: {path: '/media/:id'}} as unknown as Request
  const run = (elapsedMs: number) => {
    const writeHead = vi.fn()
    const res = {
      statusCode: 200,
      headersSent: false,
      writeHead,
      setHeader: (name: string, value: string) => { headers[name] = value },
    } as unknown as Response
    middleware(req, res, () => {})
    clock.t += elapsedMs
    res.writeHead(200)
    return {writeHead}
  }
  return {log, headers, run}
}

describe('parseThresholdMs', () => {
  it('uses the fallback for missing or invalid values and accepts 0', () => {
    expect(parseThresholdMs(undefined, 150)).toBe(150)
    expect(parseThresholdMs('', 150)).toBe(150)
    expect(parseThresholdMs('abc', 150)).toBe(150)
    expect(parseThresholdMs('-5', 150)).toBe(150)
    expect(parseThresholdMs('0', 150)).toBe(0)
    expect(parseThresholdMs('300', 150)).toBe(300)
  })
})

describe('describeRoute', () => {
  it('logs the route pattern, never the URL with its query or file paths', () => {
    expect(describeRoute({method: 'POST', baseUrl: '/api', route: {path: '/media/:id'}} as unknown as Request)).toBe('POST /api/media/:id')
    expect(describeRoute({method: 'GET', baseUrl: '', route: undefined} as unknown as Request)).toBe('GET (unmatched)')
  })
})

describe('createSlowRequestLogger', () => {
  it('logs a slow response once, adds Server-Timing and still calls the original writeHead', () => {
    const clock = {t: 1000}
    const {log, headers, run} = setup(150, clock)
    const {writeHead} = run(220)
    expect(headers['Server-Timing']).toBe('app;dur=220.0')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toBe('[slow-request] GET /api/media/:id -> 200 in 220 ms')
    expect(writeHead).toHaveBeenCalledWith(200)
  })

  it('stays quiet for fast responses but still reports their timing', () => {
    const clock = {t: 0}
    const {log, headers, run} = setup(150, clock)
    run(20)
    expect(log).not.toHaveBeenCalled()
    expect(headers['Server-Timing']).toBe('app;dur=20.0')
  })

  it('throttles repeated slow lines for the same route and reports how many were skipped', () => {
    const clock = {t: 0}
    const {log, run} = setup(100, clock)
    run(200)
    run(200)
    run(200)
    expect(log).toHaveBeenCalledTimes(1)
    clock.t += 2000
    run(200)
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[1][0]).toContain('(+2 similar since the last line)')
  })

  it('does nothing when disabled', () => {
    const clock = {t: 0}
    const {log, headers, run} = setup(0, clock)
    run(5000)
    expect(log).not.toHaveBeenCalled()
    expect(headers['Server-Timing']).toBeUndefined()
  })
})

describe('startEventLoopLagMonitor', () => {
  it('returns a no-op stop function when disabled', () => {
    const log = vi.fn()
    const stop = startEventLoopLagMonitor({thresholdMs: 0, log})
    expect(() => stop()).not.toThrow()
    expect(log).not.toHaveBeenCalled()
  })

  it('reports a blocked event loop', async () => {
    const log = vi.fn()
    const stop = startEventLoopLagMonitor({thresholdMs: 50, log, intervalMs: 400})
    // The histogram needs one normal tick before it can measure a stall.
    await new Promise(resolve => setTimeout(resolve, 40))
    const end = Date.now() + 120
    while (Date.now() < end) { /* block the loop on purpose */ }
    await new Promise(resolve => setTimeout(resolve, 500))
    stop()
    expect(log).toHaveBeenCalled()
    expect(log.mock.calls[0][0]).toMatch(/^\[event-loop\] blocked for up to \d+ ms/)
  })
})
