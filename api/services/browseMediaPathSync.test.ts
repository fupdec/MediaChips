import {describe, expect, it} from 'vitest'
import {remapMovedMediaPath, syncMediaPathsForMove} from './browseMediaPathSync'

describe('remapMovedMediaPath', () => {
  it('rewrites a file path', () => {
    expect(remapMovedMediaPath('/media/a.mp4', '/media/a.mp4', '/other/a.mp4')).toBe('/other/a.mp4')
  })

  it('rewrites children of a moved folder and keeps the separator', () => {
    expect(remapMovedMediaPath(
      '/media/Movies/Action/a.mp4',
      '/media/Movies',
      '/disk/Movies',
    )).toBe('/disk/Movies/Action/a.mp4')

    expect(remapMovedMediaPath(
      'C:\\Videos\\Action\\a.mp4',
      'C:\\Videos',
      'D:\\Videos',
    )).toBe('D:\\Videos\\Action\\a.mp4')
  })

  it('does not treat a similarly named sibling as a child', () => {
    expect(remapMovedMediaPath('/media/Movies2/a.mp4', '/media/Movies', '/disk/Movies')).toBeNull()
  })
})

describe('syncMediaPathsForMove', () => {
  it('updates matching media rows through the repository', () => {
    const updates: Array<{id: number; path: string}> = []
    const updated = syncMediaPathsForMove(
      {
        findByPaths: (paths) => paths.includes('/media/Movies')
          ? []
          : [],
        findIdAndPathByLikePatterns: () => [
          {id: 1, path: '/media/Movies/a.mp4'},
          {id: 2, path: '/media/Other/b.mp4'},
        ],
        updateById: (id, data) => {
          updates.push({id, path: String((data as {path?: string}).path || '')})
        },
      },
      '/media/Movies',
      '/disk/Movies',
    )

    expect(updated).toBe(1)
    expect(updates).toEqual([{id: 1, path: '/disk/Movies/a.mp4'}])
  })
})
