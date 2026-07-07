# Changelog

All notable changes to MediaChips are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-07-08

### Fixed

- **Media metadata and previews on add** — restore synchronous ffprobe metadata and video thumbnail generation during import so files appear in the library with previews immediately

### Changed

- **Duplicate detection on import** — keep fast basename/filesize checks with background content hashing instead of blocking on full-file hashes

## [1.0.1] - 2026-07-08

### Fixed

- **Server hang after adding media** — queue background post-processing (ffmpeg, ffprobe, content hash) with concurrency limits so bulk imports no longer freeze the API
- **Phantom scrollbar in navigation sidebar on Windows**
- **Flaky E2E navigation** blocked by the onboarding overlay

### Changed

- **Windows system menu** — simplified menu order; removed Edit and Window menus

## [1.0.0] - 2026-07-07

First stable release of the Vue 3 rewrite.

### Added

- **LowDB migration wizard** — auto-detects legacy `dbs.json` on startup and opens the migration dialog
- **Onboarding wizard** — first-launch setup guide with resumable progress stored in `config.json`
- **Tag page layouts** — switchable designs per tag category (profile, grid, and more)
- **Metadata field pinning** — drag-and-drop boards for assigning and reordering pinned fields
- **Windows system tray** — optional minimize-to-tray on close (Settings → General)
- **Windows Window menu** — Minimize, Zoom, and Full Screen in the system menu bar
- **FTS search** — full-text search for tags and media with lazy ML model loading
- **Video codec backfill** — maintenance task for videos missing ffprobe metadata
- **Copy to clipboard** — tag names and file paths from the tag page header
- **E2E test suite** — expanded from smoke tests to 16 scenarios (API auth, health, backups, navigation)
- **Coverage thresholds** in CI to prevent test coverage regression

### Changed

- **Vue 3 rewrite** — first stable release on the `master` branch
- **Machine-level settings** — global options (zoom, LAN access, transcode, tray) moved from the database to `config.json`
- **License registration** — stored in `config.json` instead of the database
- **Backend** — migrated to ESM imports; Drizzle ORM with performance indexes for duplicates and filters
- **Startup performance** — deferred heavy modules, lazy-loaded home widgets, trimmed packaged logs, smaller installers
- **Library browsing** — server-side tag pagination, grid thumb prefetch, stabilized infinite scroll
- **Watched folders** — faster imports, improved scan reliability, menu badge refresh after adding files
- **Tag list loading** — `find_duplicates` no longer forces the legacy JS filter path for tag pages
- **API error responses** — task controllers return structured `{ message }` instead of raw error objects
- **Production logging** — removed debug console output from Electron bootstrap and server startup
- **Bundle loading** — country flags and material icon data load lazily in separate chunks

### Fixed

- **Production builds** — tags and media lists empty in packaged installers (server imported from excluded `src/`)
- **Global search** — filtering for non-ASCII media and tag names; hover preview aspect ratio
- **Tag and media editing** — FTS sync on save; dialogs stay open until pinned meta save completes
- **Database switching** — home widgets refresh after activation
- **Drag-and-drop overlay** — confined to main content area; respects app chrome offsets
- **PageTag** — API failures now show notifications and an error alert instead of failing silently
- **DialogMigration** — restore backup errors are surfaced to the user
- **Timeline and player** — hover preview positioning; frame images for scrub preview
- **Tag previews** — `unavailable.png` fallback when thumb files are missing
- **Filter panel** — dropdown positioning and overlay z-index
- **Windows** — folder drag-and-drop via `webUtils.getPathForFile`; Task API routes in packaged builds
- **Media insert** — normalized SQLite bind values for `better-sqlite3`

### Upgrade notes

- **From v0.14.x-beta:** in-app auto-update should deliver v1.0.0; otherwise install manually once
- **From v0.13.1 or older:** install the latest beta or v1.0.0 manually first
- **Portable Windows** builds do not support in-app auto-update
- **macOS** builds are unsigned; see [INSTALLATION.md](./INSTALLATION.md) for Gatekeeper steps and manual DMG update flow

## [0.14.2-beta] - 2026-06-26

### Fixed

- **Windows folder drag-and-drop** — use `webUtils.getPathForFile` in preload so dropped folders resolve correctly in Electron
- **Drag-and-drop overlay** — confined to the main content area below the app bar instead of covering the entire window
- **Media insert failures** — normalize SQLite bind values for `better-sqlite3` so new media records save reliably

### Upgrade notes

- **From v0.14.1-beta:** in-app auto-update should deliver this beta; otherwise install manually once
- **From v0.14.0-beta or older:** install the latest v0.14.x-beta manually first
- **Portable Windows** builds do not support in-app auto-update
- **macOS** builds are unsigned; see [INSTALLATION.md](./INSTALLATION.md) for Gatekeeper steps and manual DMG update flow
- This is a **beta** — report issues on GitHub before the stable v0.14.0 release

## [0.14.1-beta] - 2026-06-26

### Added

- **Global search UX** — virtual scrolling and keyboard navigation for faster browsing through large result sets

### Changed

- **Electron 42 and Vite 8** upgrade with Rolldown-compatible build configuration
- **Database layer** — replaced `sqlite3` with `better-sqlite3` and a Sequelize dialect adapter; separate Node/Electron rebuild scripts for dev server and packaged app
- **Image processing** — replaced `sharp` with Jimp for metadata, thumbnails, and batch image generation
- **Video processing** — replaced `fluent-ffmpeg` with spawn-based helpers; ffmpeg binaries unpacked from asar on Windows
- **Separate player window** — title synced with the current file, playback stops when the window closes, improved Windows window chrome
- **Dependency cleanup** — removed unused `lodash-es`, `vue-drag-drop`, and `vuewordcloud`; consolidated on `lodash`
- **rimraf v6** — callers migrated to the promise API
- **Native module rebuild hooks** (`preelectron` / `preserver`) so `better-sqlite3` matches the active Node or Electron runtime

### Fixed

- **Windows packaged builds** — Task API routes missing because `fs-extra` and `rimraf` were not bundled; improved route load diagnostics
- **Windows packaged builds** — video image generation, timeline generation, and file resolution on Windows paths
- **Windows license registration** — device ID lookup via Electron IPC and fallback HTTP endpoints; activation no longer fails with 404 when the local API base URL is wrong
- **Electron API calls using LAN IP instead of localhost** — API requests stay on the page origin so `config.ip` no longer breaks local desktop sessions on Windows
- **License fingerprint in dev mode** — no longer falls back to Vite HTML; validates a real hex device ID
- **Global search** — hover preview aspect ratio for video results
- **Task API registration on Electron** — lazy-loaded image modules and video-core fallback when native image processing fails to load on Windows

### Upgrade notes

- **From v0.14.0-beta:** in-app auto-update should deliver this beta; otherwise install manually once
- **From v0.13.1 or older:** install v0.14.0-beta or v0.14.1-beta manually first
- **Portable Windows** builds do not support in-app auto-update
- **macOS** builds are unsigned; see [INSTALLATION.md](./INSTALLATION.md) for Gatekeeper steps and manual DMG update flow
- This is a **beta** — report issues on GitHub before the stable v0.14.0 release

## [0.14.0-beta] - 2026-06-25

### Added

- **Redesigned home page** with configurable widgets (stats, extended stats, continue watching, favorites, top views, markers, health alerts, top tags, quick actions)
- **Audio** and **text** media types with full backend and UI support
- **SFW mode** — optional blur for images in the main content area
- **Persistent interface zoom** with keyboard shortcuts and settings
- **Markers page** — filtering, sorting, infinite scroll, and thumbnail generation
- **Settings → Video** tab; **field pinning** with drag-reorder
- **Database maintenance tools** and batch video image generation
- **Mute toggle** on fullscreen video hover preview

### Changed

- **Settings** reorganized into General, Appearance, Library, Files, Video, and About tabs
- Improved **items pagination**, infinite scroll, smart playlists, and saved filters UI
- Settings lists show **database sizes**; filters drawer readability improved
- **Item context menu** labels localized across all locales

### Fixed

- **Production builds (DMG/installers)** — tags and media lists empty because server code imported from excluded `src/`
- API routing gaps; macOS auto-update for unsigned builds
- License activation, tag page tabs, player error layout, import duplicates
- System player on Windows 11; country flags with commas in names
- Image viewer, list pagination regressions, settings scroll layout

### Upgrade notes

- **From v0.13.1:** in-app auto-update should deliver this beta if you are already on v0.13.1; otherwise install manually once
- **From v0.13.0 or older:** install v0.13.1 or v0.14.0-beta manually first
- **Portable Windows** builds do not support in-app auto-update
- **macOS** builds are unsigned; see [INSTALLATION.md](./INSTALLATION.md) for Gatekeeper steps and manual DMG update flow
- This is a **beta** — report issues on GitHub before the stable v0.14.0 release

## [0.13.1] - 2026-06-20

### Added

- **In-app auto-update** for Windows (NSIS), macOS (ZIP), and Linux (AppImage) via GitHub Releases
- **GitHub Actions** — CI workflow and multi-platform release pipeline (Windows, macOS, Linux)
- **In-app version history** entry for the v0.13.0 Vue 3 rewrite

### Changed

- **macOS releases** — separate `arm64` and `x64` DMG/ZIP builds instead of a universal binary

### Fixed

- Release publish workflow — single publish job, installer-only uploads, retries, git checkout for `gh release create`

### Upgrade notes

- **From v0.13.0:** install v0.13.1 manually once; in-app auto-update works starting from this version (Windows/Linux fully; macOS checks for updates and opens DMG)
- **Portable Windows** builds do not support in-app auto-update
- **macOS** builds are unsigned; see [INSTALLATION.md](./INSTALLATION.md) for Gatekeeper and manual update steps

## [0.13.0] - 2026-06-19

Major release: full Vue 3 rewrite on Vite, Vuetify 3, Pinia, Electron 39, and Express 5.

See [release notes](https://github.com/fupdec/MediaChips/releases/tag/v0.13.0) and in-app version history for details.
