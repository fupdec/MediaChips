import {describe, expect, it} from 'vitest'
import {movieToExtras, parseSeasonEpisode, personToExtras} from './tmdbClient'

describe('parseSeasonEpisode', () => {
  it('parses SxxExx from filenames', () => {
    expect(parseSeasonEpisode('The_Big_Bang_Theory.s01e01.BDRip')).toEqual({
      season: 1,
      episode: 1,
    })
    expect(parseSeasonEpisode('Show.S12E103')).toEqual({season: 12, episode: 103})
    expect(parseSeasonEpisode('Movie.2020')).toBeNull()
  })
})

describe('movieToExtras', () => {
  it('maps TMDB title details to transfer extras', () => {
    const extras = movieToExtras({
      id: 1418,
      mediaType: 'tv',
      title: 'The Big Bang Theory S01E01 — Pilot',
      originalTitle: 'The Big Bang Theory',
      overview: 'Overview',
      releaseDate: '2007-09-24',
      runtime: 22,
      posterUrl: 'https://image.tmdb.org/t/p/original/p.jpg',
      backdropUrl: null,
      imdbId: 'tt0898266',
      studio: 'CBS',
      genres: ['Comedy'],
      cast: ['Johnny Galecki'],
      directors: ['James Burrows'],
      seasonNumber: 1,
      episodeNumber: 1,
    })

    expect(extras.title).toContain('Pilot')
    expect(extras.release_date).toBe('2007-09-24')
    expect(extras.studio).toBe('CBS')
    expect(extras.cast).toEqual(['Johnny Galecki'])
    expect(extras.genres).toEqual(['Comedy'])
  })
})

describe('personToExtras', () => {
  it('maps TMDB person details to transfer extras', () => {
    const extras = personToExtras({
      id: 17419,
      name: 'Johnny Galecki',
      alsoKnownAs: ['John Galecki'],
      biography: 'American actor.',
      birthday: '1975-04-30',
      deathday: null,
      placeOfBirth: 'Belgium',
      knownForDepartment: 'Acting',
      gender: 'Male',
      profileUrl: 'https://image.tmdb.org/t/p/original/x.jpg',
      imdbId: 'nm0302108',
      homepage: null,
    })

    expect(extras.name).toBe('Johnny Galecki')
    expect(extras.synonyms).toBe('John Galecki')
    expect(extras.birthday).toBe('1975-04-30')
    expect(extras.gender).toBe('Male')
    expect(extras.image).toContain('x.jpg')
  })
})
