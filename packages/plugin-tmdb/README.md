# TMDB scraper

Uses the official [TMDB API v3](https://developer.themoviedb.org/docs/getting-started) to search movies and apply metadata to MediaChips media items.

## Setup

1. Create an API key at [themoviedb.org](https://www.themoviedb.org/settings/api)
2. Enable **TMDB scraper** in Settings → Plugins
3. Paste the API key in the TMDB settings panel
4. Optionally run **Ensure scraper fields** for your video media type
5. Open a video → **TMDB** → search by title / paste TMDB or IMDb id → Apply

## Identification

- Title (+ optional year) via `/search/movie`
- TMDB id via `/movie/{id}`
- IMDb id (`tt…`) via `/find/{imdb_id}?external_source=imdb_id`

This plugin does **not** fingerprint files. Matching is by name/id only.
