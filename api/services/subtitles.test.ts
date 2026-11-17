import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {decodeSubtitleBuffer, listSubtitleTracks, readSubtitleFile} from './subtitles'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, {recursive: true, force: true})))
})

async function createFolder(files: Record<string, string | Buffer>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'subs-'))
  directories.push(directory)
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(directory, name), content)
  return directory
}

describe('decodeSubtitleBuffer', () => {
  it('reads UTF-8 with and without BOM', () => {
    expect(decodeSubtitleBuffer(Buffer.from('Привет', 'utf8'))).toBe('Привет')
    expect(decodeSubtitleBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Привет')]))).toBe('Привет')
  })

  it('reads UTF-16 with BOM', () => {
    const body = Buffer.from('Hi мир', 'utf16le')
    expect(decodeSubtitleBuffer(Buffer.concat([Buffer.from([0xff, 0xfe]), body]))).toBe('Hi мир')
  })

  it('falls back to windows-1251 for Cyrillic and windows-1252 for Western text', () => {
    const cyrillic = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xec, 0xe8, 0xf0]) // "Привет мир"
    expect(decodeSubtitleBuffer(cyrillic)).toBe('Привет мир')
    const western = Buffer.from('Caf\xe9 au lait, please come to the caf\xe9 today', 'latin1')
    expect(decodeSubtitleBuffer(western)).toBe('Café au lait, please come to the café today')
  })
})

describe('subtitle files next to a video', () => {
  it('lists only matching sidecars, exact name first', async () => {
    const directory = await createFolder({
      'Movie.mkv': 'video', 'Movie.ru.srt': '1', 'Movie.srt': '2', 'Other.srt': '3', 'Movie.txt': '4',
    })
    const tracks = await listSubtitleTracks(path.join(directory, 'Movie.mkv'))
    expect(tracks.map(track => track.name)).toEqual(['Movie.srt', 'Movie.ru.srt'])
  })

  it('returns nothing for a missing folder', async () => {
    expect(await listSubtitleTracks('/definitely/not/here/Movie.mkv')).toEqual([])
  })

  it('reads a listed track and refuses everything else', async () => {
    const directory = await createFolder({'Movie.mkv': 'v', 'Movie.srt': '1\n00:00:01,000 --> 00:00:02,000\nHi\n', 'secret.srt': 'x'})
    const video = path.join(directory, 'Movie.mkv')
    expect(await readSubtitleFile(video, 'Movie.srt')).toMatchObject({name: 'Movie.srt', format: 'srt'})
    expect(await readSubtitleFile(video, 'secret.srt')).toBeNull()
    expect(await readSubtitleFile(video, '../Movie.srt')).toBeNull()
    expect(await readSubtitleFile(video, path.join(directory, 'Movie.srt'))).toBeNull()
  })

  it('does not follow symlinks out of the folder', async () => {
    const outside = await createFolder({'target.txt': 'secret'})
    const directory = await createFolder({'Movie.mkv': 'v'})
    await symlink(path.join(outside, 'target.txt'), path.join(directory, 'Movie.srt'))
    expect(await readSubtitleFile(path.join(directory, 'Movie.mkv'), 'Movie.srt')).toBeNull()
  })
})
