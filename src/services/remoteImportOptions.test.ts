import {describe, expect, it} from 'vitest'
import {defaultRemoteImportOptions, remotePathExcluder} from './remoteImportOptions'

describe('remote import exclusions', () => {
  it('defaults to parsing tags with no exclusions', () => {
    const options = defaultRemoteImportOptions()
    expect(options.parseTags).toBe(true)
    expect(remotePathExcluder({...options, excluded: '/Кино'})('/Кино/clip.mp4')).toBe(false)
  })

  it('accepts pasted paths and fragments, one per line, just like local imports', () => {
    const excludes = remotePathExcluder({parseTags: true, excludePaths: true,
      excluded: '  "/Кино/Пропустить"\r\n\n \'trailer\' \n'})
    expect(excludes('/Кино/Пропустить/nested/clip.mp4')).toBe(true)
    expect(excludes('/Кино/movie-trailer.mp4')).toBe(true)
    expect(excludes('/Кино/Хорошее/clip.mp4')).toBe(false)
  })
})
