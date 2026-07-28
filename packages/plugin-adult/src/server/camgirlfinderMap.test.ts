import {describe, expect, it} from 'vitest'
import {
  mapFaceSearchJobToPerformers,
  mapNameSearchAccountsToPerformers,
} from './camgirlfinderMap'
import type {CamGirlFinderAccount, CamGirlFinderJob} from './camgirlfinderApi'

describe('camgirlfinderMap', () => {
  it('maps face search predictions into scraper performers', () => {
    const job: CamGirlFinderJob = {
      id: 'abc',
      status: 'finished',
      created: '2026-01-01T00:00:00.000Z',
      duration: 500,
      urls: {
        job: 'https://camgirlfinder.to/jobs/abc',
        fullImage: 'https://example.com/full.webp',
        faceImage: 'https://example.com/face.webp',
      },
      predictions: [
        {
          platform: 'sc',
          model: 'Marlene_Ward_',
          gender: 'f',
          seen: '2021-01-01T00:00:00Z',
          accountSeen: '2021-01-02T00:00:00Z',
          distance: 0.41,
          probability: 'high',
          urls: {
            profile: 'https://camgirlfinder.to/models/sc/Marlene_Ward_',
            externalProfile: 'https://api.camgirlfinder.to/out/sc/Marlene_Ward_',
            faceImage: 'https://example.com/a-face.webp',
            fullImage: 'https://example.com/a-full.webp',
          },
        },
        {
          platform: 'lj',
          model: 'MilanaWard',
          gender: 'f',
          seen: '2021-01-01T00:00:00Z',
          accountSeen: '2021-01-02T00:00:00Z',
          distance: 0.66,
          probability: 'high',
          urls: {
            profile: 'https://camgirlfinder.to/models/lj/MilanaWard',
            externalProfile: 'https://api.camgirlfinder.to/out/lj/MilanaWard',
            faceImage: 'https://example.com/b-face.webp',
            fullImage: 'https://example.com/b-full.webp',
          },
        },
      ],
    }

    const performers = mapFaceSearchJobToPerformers(job)
    expect(performers).toHaveLength(2)
    expect(performers[0].name).toBe('Marlene_Ward_')
    expect(performers[0].aliases).toContain('MilanaWard')
    expect(performers[0].extras).toEqual({gender: 'Female'})
    expect(performers[0].posters?.[0]?.url).toContain('a-face.webp')
    expect(performers[0].fullImage).toContain('a-full.webp')
    expect(String(performers[0].bio)).toContain('CamGirlFinder')
    expect(String(performers[0].bio)).toContain('StripChat')
  })

  it('maps name search accounts and similar aliases', () => {
    const accounts: CamGirlFinderAccount[] = [
      {
        name: 'Kati3kat',
        platform: 'mfc',
        gender: 'f',
        distance: 0,
        faces: 10,
        firstSeen: '2015-01-01T00:00:00Z',
        lastSeen: '2023-01-01T00:00:00Z',
        persons: [
          {
            person: 1,
            faces: 10,
            seen: '2016-01-01T00:00:00Z',
            firstSeen: '2015-01-01T00:00:00Z',
            lastSeen: '2023-01-01T00:00:00Z',
            urls: {
              faceImage: 'https://example.com/kati-face.webp',
              fullImage: 'https://example.com/kati-full.webp',
            },
          },
        ],
        urls: {
          profile: 'https://camgirlfinder.to/models/mfc/Kati3kat',
          externalProfile: 'https://api.camgirlfinder.to/out/mfc/Kati3kat',
        },
      },
    ]

    const performers = mapNameSearchAccountsToPerformers(accounts, {
      similarByAccount: {
        'mfc::kati3kat': [
          {
            platform: 'sc',
            model: 'Socki3Kat',
            gender: 'f',
            seen: '2016-01-01T00:00:00Z',
            accountSeen: '2020-01-01T00:00:00Z',
            distance: 0.18,
            probability: 'high',
            urls: {
              profile: 'https://camgirlfinder.to/models/sc/Socki3Kat',
              externalProfile: 'https://api.camgirlfinder.to/out/sc/Socki3Kat',
              faceImage: 'https://example.com/socki-face.webp',
              fullImage: 'https://example.com/socki-full.webp',
            },
          },
        ],
      },
    })

    expect(performers).toHaveLength(1)
    expect(performers[0].aliases).toContain('Socki3Kat')
    expect(performers[0].platformLabel).toBe('MyFreeCams')
    expect(performers[0].face).toContain('kati-face.webp')
  })
})
