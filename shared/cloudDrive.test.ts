import {describe, expect, it} from 'vitest'
import {driveMediaKind, driveMediaContentType, driveFileViewUrl} from './cloudDrive'

describe('Drive media formats', () => {
  it.each(['WMV', 'asf', 'avi', 'mkv', 'mpg', 'mpeg', 'flv', 'mts', 'm2ts', 'ts', '3gp', '3gpp', 'ogv', 'rmvb'])('recognizes %s video containers without claiming codec support', ext => {
    expect(driveMediaKind(`Movie.${ext}`)).toBe('video')
  })
  it('keeps audio/image types and unknown extensions distinct', () => {
    expect(driveMediaKind('music.ogg')).toBe('audio')
    expect(driveMediaKind('photo.jpg')).toBe('image')
    expect(driveMediaKind('document.txt')).toBeNull()
    expect(driveMediaKind('constructor')).toBeNull()
  })
  it('normalizes generic video MIME types while preserving explicit non-media types', () => {
    expect(driveMediaContentType('Movie.WMV', 'application/octet-stream')).toBe('video/x-ms-wmv')
    expect(driveMediaContentType('Movie.wmv', 'text/html')).toBe('text/html')
    expect(driveMediaContentType('Movie.wmv', 'application/vnd.google-apps.document')).toBe('application/vnd.google-apps.document')
    expect(driveMediaContentType('document.txt', 'application/octet-stream')).toBe('application/octet-stream')
  })
  it('builds a Google player URL only for valid Drive identities', () => {
    expect(driveFileViewUrl('gdrive://movie-123')).toBe('https://drive.google.com/file/d/movie-123/view')
    for (const path of ['gdrive://../etc', 'gdrive://movie?token=secret', 'https://other.example/movie', undefined]) {
      expect(driveFileViewUrl(path)).toBeNull()
    }
  })
})
