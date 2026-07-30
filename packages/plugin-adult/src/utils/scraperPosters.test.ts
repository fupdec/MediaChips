import { describe, expect, it } from 'vitest'
import {
  assignmentsFromPosterUrls,
  assignScraperImageSlot,
  getOrderedScraperPosters,
  nextFreeScraperImageSlot,
  normalizeScraperPoster,
  pickPrimaryScraperPoster,
  toggleScraperImageAssignment,
} from './scraperPosters'
import type { ScraperPoster } from '../types/scraper'

const posters: ScraperPoster[] = [
  { id: 1, url: 'https://example.com/first.jpg', size: 10 },
  { id: 2, url: 'https://example.com/second.jpg', size: 200 },
  { id: 3, url: '', size: 300 },
]

describe('scraperPosters', () => {
  it('keeps API order and skips posters without urls', () => {
    expect(getOrderedScraperPosters(posters).map((poster) => poster.id)).toEqual([1, 2])
  })

  it('picks the first poster in list order, not the largest', () => {
    expect(pickPrimaryScraperPoster(posters)?.id).toBe(1)
  })

  it('normalizes width, height, and size from raw API objects', () => {
    expect(
      normalizeScraperPoster({
        id: 'p1',
        url: 'https://example.com/a.jpg',
        size: '2048',
        width: '800',
        height: '1200',
      }),
    ).toEqual({
      id: 'p1',
      url: 'https://example.com/a.jpg',
      size: 2048,
      width: 800,
      height: 1200,
    })
  })

  it('drops invalid dimensions and empty urls during normalize', () => {
    expect(normalizeScraperPoster({url: '', size: 10})).toBeNull()
    expect(
      normalizeScraperPoster({
        url: 'https://example.com/b.jpg',
        width: 0,
        height: -1,
        size: 'nope',
      }),
    ).toEqual({
      id: 0,
      url: 'https://example.com/b.jpg',
      size: 0,
    })
  })

  it('auto-assigns slots in default order and clears on toggle', () => {
    let assignments = toggleScraperImageAssignment([], 'https://a.jpg')
    expect(assignments).toEqual([{url: 'https://a.jpg', type: 'main'}])

    assignments = toggleScraperImageAssignment(assignments, 'https://b.jpg')
    expect(assignments.map((item) => item.type)).toEqual(['main', 'alt'])

    assignments = toggleScraperImageAssignment(assignments, 'https://a.jpg')
    expect(assignments).toEqual([{url: 'https://b.jpg', type: 'alt'}])
  })

  it('stops assigning when all six slots are taken', () => {
    const urls = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `https://${id}.jpg`)
    let assignments = assignmentsFromPosterUrls(urls)
    expect(assignments).toHaveLength(6)
    expect(nextFreeScraperImageSlot(assignments)).toBeNull()

    const before = [...assignments]
    assignments = toggleScraperImageAssignment(assignments, 'https://g.jpg')
    expect(assignments).toEqual(before)
  })

  it('reassigns a url to another slot and frees the previous occupant', () => {
    const assignments = assignScraperImageSlot(
      [
        {url: 'https://a.jpg', type: 'main'},
        {url: 'https://b.jpg', type: 'alt'},
      ],
      'https://b.jpg',
      'main',
    )
    expect(assignments).toEqual([{url: 'https://b.jpg', type: 'main'}])
  })

  it('maps ordered urls into the first N default slots', () => {
    expect(
      assignmentsFromPosterUrls(
        ['https://a.jpg', '', 'https://b.jpg', 'https://c.jpg'],
        4,
      ),
    ).toEqual([
      {url: 'https://a.jpg', type: 'main'},
      {url: 'https://b.jpg', type: 'alt'},
      {url: 'https://c.jpg', type: 'custom1'},
    ])
  })
})
