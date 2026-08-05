import { describe, expect, it } from 'vitest'
import { buildM3uPlaylist, playlistExportFilename } from './playlistExport'

describe('playlistExportFilename', () => {
  it('sanitizes illegal characters and adds .m3u8', () => {
    expect(playlistExportFilename('My/Playlist:1')).toBe('My_Playlist_1.m3u8')
    expect(playlistExportFilename('')).toBe('playlist.m3u8')
    expect(playlistExportFilename(null)).toBe('playlist.m3u8')
  })
})

describe('buildM3uPlaylist', () => {
  it('builds EXTINF entries and skips items without a path', () => {
    const text = buildM3uPlaylist([
      { path: '/media/a.mp4', name: 'Clip, One' },
      { medium: { path: '/media/b.mp4', name: 'Two' } as never },
      { name: 'missing' },
    ], 'Night, List')

    expect(text).toBe([
      '#EXTM3U',
      '#PLAYLIST:Night -  List',
      '#EXTINF:-1,Clip -  One',
      '/media/a.mp4',
      '#EXTINF:-1,Two',
      '/media/b.mp4',
    ].join('\n'))
  })

  it('omits playlist header when name is empty', () => {
    expect(buildM3uPlaylist([{ path: '/x.mp4', name: 'X' }])).toBe(
      ['#EXTM3U', '#EXTINF:-1,X', '/x.mp4'].join('\n'),
    )
  })
})
