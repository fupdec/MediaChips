/** Pure MP4 box / sample-table probing (no filesystem). */

/** Sample tables this large with 1-sample chunks routinely hang Chromium seeks. */
export const PATHOLOGICAL_SAMPLE_COUNT = 10_000

export interface Mp4BoxInfo {
  offset: number
  size: number
  headerSize: number
  type: string
}

export function readBoxes(buffer: Buffer, start: number, end: number): Mp4BoxInfo[] {
  const boxes: Mp4BoxInfo[] = []
  let offset = start

  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    let headerSize = 8

    if (size === 1) {
      if (offset + 16 > end) break
      const large = buffer.readBigUInt64BE(offset + 8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break
      size = Number(large)
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }

    if (size < headerSize) break

    boxes.push({offset, size, headerSize, type})
    if (offset + size > end) break
    offset += size
  }

  return boxes
}

export function findBox(boxes: Mp4BoxInfo[], type: string): Mp4BoxInfo | undefined {
  return boxes.find((box) => box.type === type)
}

export function readStscPathological(buffer: Buffer, box: Mp4BoxInfo): boolean {
  const bodyStart = box.offset + box.headerSize
  if (bodyStart + 8 > buffer.length) return false

  // FullBox: version(1) + flags(3) + entry_count(4)
  const entryCount = buffer.readUInt32BE(bodyStart + 4)
  if (!entryCount) return false

  const entriesStart = bodyStart + 8
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesStart + index * 12
    if (entryOffset + 12 > buffer.length) break
    const samplesPerChunk = buffer.readUInt32BE(entryOffset + 4)
    if (samplesPerChunk === 1) return true
  }

  return false
}

export function readStszSampleCount(buffer: Buffer, box: Mp4BoxInfo): number {
  const bodyStart = box.offset + box.headerSize
  if (bodyStart + 12 > buffer.length) return 0
  // FullBox + sample_size(4) + sample_count(4)
  return buffer.readUInt32BE(bodyStart + 8)
}

export function readSttsEntryCount(buffer: Buffer, box: Mp4BoxInfo): number {
  const bodyStart = box.offset + box.headerSize
  if (bodyStart + 8 > buffer.length) return 0
  return buffer.readUInt32BE(bodyStart + 4)
}

export function isVideoTrack(buffer: Buffer, trak: Mp4BoxInfo): boolean {
  const trakBoxes = readBoxes(buffer, trak.offset + trak.headerSize, Math.min(trak.offset + trak.size, buffer.length))
  const mdia = findBox(trakBoxes, 'mdia')
  if (!mdia) return false

  const mdiaBoxes = readBoxes(buffer, mdia.offset + mdia.headerSize, Math.min(mdia.offset + mdia.size, buffer.length))
  const hdlr = findBox(mdiaBoxes, 'hdlr')
  if (!hdlr || hdlr.offset + hdlr.headerSize + 12 > buffer.length) return false

  const handler = buffer.toString('ascii', hdlr.offset + hdlr.headerSize + 8, hdlr.offset + hdlr.headerSize + 12)
  return handler === 'vide'
}

export function getVideoSampleTable(buffer: Buffer, moov: Mp4BoxInfo) {
  const moovEnd = Math.min(moov.offset + moov.size, buffer.length)
  const moovBoxes = readBoxes(buffer, moov.offset + moov.headerSize, moovEnd)

  for (const trak of moovBoxes.filter((box) => box.type === 'trak')) {
    if (!isVideoTrack(buffer, trak)) continue

    const trakBoxes = readBoxes(buffer, trak.offset + trak.headerSize, Math.min(trak.offset + trak.size, buffer.length))
    const mdia = findBox(trakBoxes, 'mdia')
    if (!mdia) continue

    const mdiaBoxes = readBoxes(buffer, mdia.offset + mdia.headerSize, Math.min(mdia.offset + mdia.size, buffer.length))
    const minf = findBox(mdiaBoxes, 'minf')
    if (!minf) continue

    const minfBoxes = readBoxes(buffer, minf.offset + minf.headerSize, Math.min(minf.offset + minf.size, buffer.length))
    const stbl = findBox(minfBoxes, 'stbl')
    if (!stbl) continue

    const stblBoxes = readBoxes(buffer, stbl.offset + stbl.headerSize, Math.min(stbl.offset + stbl.size, buffer.length))
    return {
      stsc: findBox(stblBoxes, 'stsc'),
      stsz: findBox(stblBoxes, 'stsz'),
      stts: findBox(stblBoxes, 'stts'),
    }
  }

  return null
}

export function probeBufferForPathologicalLayout(buffer: Buffer): boolean {
  const topBoxes = readBoxes(buffer, 0, buffer.length)
  const moov = findBox(topBoxes, 'moov')
  if (!moov) {
    // moov at end / incomplete scan — avoid false positives
    return false
  }

  // Incomplete moov in the buffer: can't decide safely.
  if (moov.offset + moov.size > buffer.length) {
    return moov.size >= PATHOLOGICAL_SAMPLE_COUNT * 8
  }

  const table = getVideoSampleTable(buffer, moov)
  if (!table) return false

  const sampleCount = table.stsz ? readStszSampleCount(buffer, table.stsz) : 0
  const sttsEntries = table.stts ? readSttsEntryCount(buffer, table.stts) : 0
  const oneSampleChunks = table.stsc ? readStscPathological(buffer, table.stsc) : false

  if (sampleCount >= PATHOLOGICAL_SAMPLE_COUNT && oneSampleChunks) {
    return true
  }

  // Per-frame timestamps (33/34 deltas) also explode demuxer seek cost.
  if (sttsEntries >= PATHOLOGICAL_SAMPLE_COUNT && oneSampleChunks) {
    return true
  }

  return false
}
