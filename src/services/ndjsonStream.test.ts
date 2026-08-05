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
