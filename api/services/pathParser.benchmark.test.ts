/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import {
  buildTagPathIndex,
  matchPathsToTagsBatch,
} from '../../shared/pathParser/core'

type BenchTag = {
  id: number
  metaId: number
  name: string
}

function makeTags(count: number): BenchTag[] {
  const tags: BenchTag[] = []
  for (let index = 0; index < count; index += 1) {
    tags.push({
      id: index + 1,
      metaId: index % 3 === 0 ? 1 : 2,
      name: index % 5 === 0 ? `Performer ${index} White` : `Performer ${index}`,
    })
  }
  return tags
}

function makePaths(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    path: `/library/Performer ${index % 500}/sets/(Performer ${index % 500}, Guest ${index})/clip-${index}.mp4`,
    mediaId: index + 1,
  }))
}

describe('path parser benchmark', () => {
  it('matches 10k paths against 5k tags within a reasonable budget', () => {
    const tags = makeTags(5000)
    const paths = makePaths(10000)
    const index = buildTagPathIndex(tags)

    const started = performance.now()
    const matches = matchPathsToTagsBatch(paths, tags, { preferLongestMatch: true })
    const elapsedMs = performance.now() - started

    expect(index.termCount).toBeGreaterThanOrEqual(5000)
    expect(matches.length).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(30_000)

    // Useful when running locally: shows actual timing in vitest output.
    console.info(`path parser benchmark: ${paths.length} paths, ${tags.length} tags, ${matches.length} matches, ${elapsedMs.toFixed(1)}ms`)
  })
})
