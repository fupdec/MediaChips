import {describe, it, expect, vi} from 'vitest'
import {readNdjsonStream} from './ndjsonStream'

function streamFrom(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

describe('readNdjsonStream', () => {
  it('parses line-delimited JSON events', async () => {
    const events: unknown[] = []
    await readNdjsonStream(
      streamFrom('{"type":"progress","processed":1}\n{"type":"complete","hashed":1}\n'),
      (event) => events.push(event),
    )

    expect(events).toEqual([
      {type: 'progress', processed: 1},
      {type: 'complete', hashed: 1},
    ])
  })

  it('parses a trailing partial buffer without newline', async () => {
    const onEvent = vi.fn()
    await readNdjsonStream(
      streamFrom('{"type":"error","message":"boom"}'),
      onEvent,
    )
    expect(onEvent).toHaveBeenCalledWith({type: 'error', message: 'boom'})
  })

  it('can ignore malformed lines', async () => {
    const events: unknown[] = []
    await readNdjsonStream(
      streamFrom('not-json\n{"type":"ok"}\n'),
      (event) => events.push(event),
      {ignoreMalformed: true},
    )
    expect(events).toEqual([{type: 'ok'}])
  })
})

describe('stream lifecycle', () => {
  it('releases the reader after normal completion', async () => {
    const stream = streamFrom('{"ok":true}\n')
    await readNdjsonStream(stream, vi.fn())
    expect(stream.locked).toBe(false)
  })

  it('does not swallow event-handler failures when ignoring malformed lines', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('bad-json\n{"ok":true}\n{"later":true}\n'))
      },
      cancel,
    })
    const failure = new Error('event handler failed')
    const onEvent = vi.fn(() => { throw failure })
    await expect(readNdjsonStream(stream, onEvent, {ignoreMalformed: true})).rejects.toBe(failure)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
  })

  it('cancels the source on invalid JSON', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('bad-json\n')) },
      cancel,
    })
    await expect(readNdjsonStream(stream, vi.fn())).rejects.toThrow(SyntaxError)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
  })

  it('preserves pause-hook errors even if cancellation fails', async () => {
    const failure = new Error('pause cancelled')
    const cancel = vi.fn(() => Promise.reject(new Error('cancel failed')))
    const stream = new ReadableStream<Uint8Array>({cancel})
    await expect(readNdjsonStream(stream, vi.fn(), {
      beforeRead: () => { throw failure },
    })).rejects.toBe(failure)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(stream.locked).toBe(false)
  })

  it('releases the reader when the source fails', async () => {
    const failure = new Error('disconnected')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(failure) },
    })
    await expect(readNdjsonStream(stream, vi.fn())).rejects.toBe(failure)
    expect(stream.locked).toBe(false)
  })

  it('decodes UTF-8 characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"name":"Фильм 🎞️"}')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        controller.close()
      },
    })
    const onEvent = vi.fn()
    await readNdjsonStream(stream, onEvent)
    expect(onEvent).toHaveBeenCalledExactlyOnceWith({name: 'Фильм 🎞️'})
    expect(stream.locked).toBe(false)
  })
})
