import fs from 'fs'
import os from 'os'
import path from 'path'
import {describe, it, expect} from 'vitest'
import {
  needsBrowserRemuxForMp4,
  probeBufferForPathologicalLayout,
} from '../../api/services/transcode/mp4ContainerLayout.js'

function writeBox(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + body.length, 0)
  header.write(type, 4, 4, 'ascii')
  return Buffer.concat([header, body])
}

function writeFullBox(type: string, version: number, body: Buffer): Buffer {
  const preface = Buffer.alloc(4)
  preface.writeUInt8(version, 0)
  return writeBox(type, Buffer.concat([preface, body]))
}

describe('probeBufferForPathologicalLayout', () => {
  it('detects 1-sample-chunk video tables with huge sample counts', () => {
    const stscBody = Buffer.alloc(4 + 12)
    stscBody.writeUInt32BE(1, 0) // entry_count
    stscBody.writeUInt32BE(1, 4) // first_chunk
    stscBody.writeUInt32BE(1, 8) // samples_per_chunk
    stscBody.writeUInt32BE(1, 12) // sample_description_index

    const stszBody = Buffer.alloc(8)
    stszBody.writeUInt32BE(0, 0) // sample_size
    stszBody.writeUInt32BE(20_000, 4) // sample_count

    const sttsBody = Buffer.alloc(4 + 8)
    sttsBody.writeUInt32BE(1, 0)
    sttsBody.writeUInt32BE(20_000, 4)
    sttsBody.writeUInt32BE(33, 8)

    const stbl = writeBox('stbl', Buffer.concat([
      writeFullBox('stsc', 0, stscBody),
      writeFullBox('stsz', 0, stszBody),
      writeFullBox('stts', 0, sttsBody),
    ]))
    const minf = writeBox('minf', stbl)
    const hdlrBody = Buffer.alloc(8)
    hdlrBody.write('vide', 4, 4, 'ascii')
    const mdia = writeBox('mdia', Buffer.concat([
      writeFullBox('hdlr', 0, hdlrBody),
      minf,
    ]))
    const trak = writeBox('trak', mdia)
    const moov = writeBox('moov', trak)
    const ftyp = writeBox('ftyp', Buffer.from('isom'))

    expect(probeBufferForPathologicalLayout(Buffer.concat([ftyp, moov]))).toBe(true)
  })

  it('ignores normal interleaved sample tables', () => {
    const stscBody = Buffer.alloc(4 + 12)
    stscBody.writeUInt32BE(1, 0)
    stscBody.writeUInt32BE(1, 4)
    stscBody.writeUInt32BE(30, 8) // samples_per_chunk
    stscBody.writeUInt32BE(1, 12)

    const stszBody = Buffer.alloc(8)
    stszBody.writeUInt32BE(0, 0)
    stszBody.writeUInt32BE(20_000, 4)

    const stbl = writeBox('stbl', Buffer.concat([
      writeFullBox('stsc', 0, stscBody),
      writeFullBox('stsz', 0, stszBody),
    ]))
    const minf = writeBox('minf', stbl)
    const hdlrBody = Buffer.alloc(8)
    hdlrBody.write('vide', 4, 4, 'ascii')
    const mdia = writeBox('mdia', Buffer.concat([
      writeFullBox('hdlr', 0, hdlrBody),
      minf,
    ]))
    const moov = writeBox('moov', writeBox('trak', mdia))

    expect(probeBufferForPathologicalLayout(moov)).toBe(false)
  })
})

describe('needsBrowserRemuxForMp4', () => {
  it('flags the known FlixEngine sample layout from a real fixture when present', () => {
    const fixture = '/Users/vit/Movies/тест/delinquents-scene4-13.mp4'
    if (!fs.existsSync(fixture)) return

    expect(needsBrowserRemuxForMp4(fixture)).toBe(true)
  })

  it('returns false for missing files', () => {
    expect(needsBrowserRemuxForMp4(path.join(os.tmpdir(), 'missing-mediachips.mp4'))).toBe(false)
  })
})
