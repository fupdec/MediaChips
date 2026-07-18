"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tmdbClient_1 = require("./tmdbClient");
(0, vitest_1.describe)('parseSeasonEpisode', () => {
    (0, vitest_1.it)('parses SxxExx from filenames', () => {
        (0, vitest_1.expect)((0, tmdbClient_1.parseSeasonEpisode)('The_Big_Bang_Theory.s01e01.BDRip')).toEqual({
            season: 1,
            episode: 1,
        });
        (0, vitest_1.expect)((0, tmdbClient_1.parseSeasonEpisode)('Show.S12E103')).toEqual({ season: 12, episode: 103 });
        (0, vitest_1.expect)((0, tmdbClient_1.parseSeasonEpisode)('Movie.2020')).toBeNull();
    });
});
(0, vitest_1.describe)('movieToExtras', () => {
    (0, vitest_1.it)('maps TMDB title details to transfer extras', () => {
        const extras = (0, tmdbClient_1.movieToExtras)({
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
        });
        (0, vitest_1.expect)(extras.title).toContain('Pilot');
        (0, vitest_1.expect)(extras.release_date).toBe('2007-09-24');
        (0, vitest_1.expect)(extras.studio).toBe('CBS');
        (0, vitest_1.expect)(extras.cast).toEqual(['Johnny Galecki']);
        (0, vitest_1.expect)(extras.genres).toEqual(['Comedy']);
    });
});
(0, vitest_1.describe)('personToExtras', () => {
    (0, vitest_1.it)('maps TMDB person details to transfer extras', () => {
        const extras = (0, tmdbClient_1.personToExtras)({
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
        });
        (0, vitest_1.expect)(extras.name).toBe('Johnny Galecki');
        (0, vitest_1.expect)(extras.synonyms).toBe('John Galecki');
        (0, vitest_1.expect)(extras.birthday).toBe('1975-04-30');
        (0, vitest_1.expect)(extras.gender).toBe('Male');
        (0, vitest_1.expect)(extras.image).toContain('x.jpg');
    });
});
