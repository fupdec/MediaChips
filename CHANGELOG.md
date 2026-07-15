# Changelog

All notable changes to MediaChips are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-07-15

### Fixed

- **Scene/performer auto-scrape** — reuse newly created performers and tags across media instead of inserting duplicates on each item

## [1.1.0] - 2026-07-15

### Added

- **Plugin system** — install user plugins from folder or zip; SFW builds strip the adult plugin; Adult plugin zip for SFW installs; sample Hello plugin for testing
- **Adult scrapers as a plugin** — ThePornDB scene and performer scrapers moved into `@mediachips/plugin-adult` with direct API calls
- **Scene scraper** — manual and bulk scene scrape dialogs, settings wiring, marker import as meta marks, gender filter for performer search/import
- **Hybrid fingerprints** — dedup, backfill, and folder scan using media fingerprints / oshash storage
- **Library path tag parsing** — parse tags from paths library-wide with preview dialog and match precision controls
- **Plugins settings** — catalog UX with installed and planned sections; link to the official download site
- **Getting-started onboarding** — clearer copy, screenshots, reopen entry points; adult scraper setup guide
- **SideBar navigation** — section labels and rail tooltips
- **Markers shuffle sort** — random order option on the markers page
- **Synonyms meta setting** — toggle synonyms on tag category metadata fields
- **License device management** — deactivate other devices with live server status
- **MS Store licensing** — separate licensing path for store builds
- **Patreon sponsor link** via GitHub FUNDING.yml

### Changed

- **Grid video previews** — 3×3 sprite grids instead of timeline strips; improved hover/fullscreen big preview UX and start position
- **Scraper onboarding** — hash step merged into media setup; clearer scraper settings UX
- **Bulk scrape UX** — status counts, hideable tasks, clearer cancel handling
- **In-app documentation** — settings tree and articles match current tabs (Plugins, Database maintenance, items-per-page, fingerprint dedup, Adult scrapers)
- **Paginated media grids** — virtual row rendering stays off to avoid jumpy scroll at page sizes like 50
- **Electron LAN share** — keep UI offline from LAN discovery and copy a real share URL
- **Performer scraper transfer** — bio → bookmarks, country/synonym fields, aliases as tag synonyms on auto-apply

### Fixed

- **Array filter labels** — swap "excludes one of" / "excludes all" so they match include operators (and user expectations)
- **Filters panel blur** — restore `backdrop-filter` on the panel (pseudo-element + isolation broke the glass effect)
- **macOS Dock restore** — clicking the Dock icon after closing the main window shows the app again
- **Grid hover preview** — direct play without live cinema; clearer unavailable state; fix stuck big preview for missing files
- **Player** — audio leak on close; marker seek on live transcode; Chromium playback for pathological H.264 MP4 layouts
- **Bulk path edits** — stop turning media names into full Windows paths; relative shared imports for Electron path updates
- **Bulk edit** — selection persistence and stale tag display after edits
- **Migration** — LowDB empty-database false success; clearer API migration error messages
- **App bar** — tab clicks and scroll arrow styling
- **SFW packaged builds** — no crash when dotenv/adult routes are absent
- **TypeScript** — production build type errors unblocked
- **Tag UI** — refresh MetaInputArray labels after database tag updates; keep marks when deleting tags; poster import and tag card image hover
- **updatedAt** — bump media `updatedAt` when new tags are assigned
- **File drops** — skip redundant file scan on direct drops
- **Playability checks** — faster checks; hide big preview letterbox bars

## [1.0.11] - 2026-07-11

### Added

- **"Only" array filter condition** — match items whose tag set is exactly the selected values (no extras, no omissions); supported in client filters, media SQL, and tag SQL
- **Automated release notes** — GitHub Releases are populated from `CHANGELOG.md` during CI publish
- **In-app changelog** — view release notes from update notifications, on first launch after updating, and in version history (bundled from `CHANGELOG.md`)
- **Skip update version** — hide a specific offered update until a newer version is published

### Changed

- **Tag array filter SQL** — faster join-based queries instead of correlated subqueries
- **Array filter labels** — corrected "excludes all" / "excludes one of" icons and wording to match actual behavior
- **Filter panel** — hide value inputs for empty/not-empty and boolean conditions; align condition icons with labels
- **Hover preview cards** — softer shadow with wider diffusion
- **Version history** — recent versions are loaded from `CHANGELOG.md` instead of manual HTML entries

### Fixed

- **License API parsing** — tolerate null or malformed activate/info responses without crashing registration
- **Dev API routing** — route localhost requests through the Vite proxy to avoid CORS errors when loading thumbnails in Electron dev

## [1.0.10] - 2026-07-10

### Added

- **Performer scraper** — automated single and batch tag updates from external sources
- **Pinned metadata sorting** — sort media and tags by pinned fields; grouped sort options in the toolbar dropdown

### Changed

- **Toolbar sort dropdown** — highlight the active sort option
- **Card descriptions** — improved visibility of empty rating and favorite icons

### Fixed

- **Tag deletion** — refresh the items list and filtered total after removing a tag
- **Ungrouped card chips** — icon and text spacing in metadata chips
- **ToolbarSort TypeScript errors** — restore CI type-check

## [1.0.9] - 2026-07-10

### Added

- **Tag page image carousel** — browse tag images in a carousel on tag pages
- **Compact hover previews** — tag and media hover previews shown as item cards
- **Windows portable release** — publish a portable build alongside the installer

### Changed

- **Metadata chip padding** — tighter spacing in media and tag grid cards
- **Virtual grid** — re-enabled for paginated lists while infinite scroll stays fully rendered
- **Grid memory use** — reduced memory consumption during long infinite scroll sessions

### Fixed

- **Player seek hotkeys** — use store time correctly during transcode playback
- **Tag thumbnails and scraper transfer** — refresh edge cases after data transfer

## [1.0.7] - 2026-07-10

### Added

- **Grid video previews** — inline playback timeline and thumb refresh on hover

### Changed

- **Player status overlays** — progress and playback labels on the video player

### Fixed

- **Windows install** — Electron fallback and HTTP model download when bundled assets are missing

## [1.0.6] - 2026-07-09

### Added

- **Big video preview size** — configurable preview dimensions with global persistence

### Changed

- **Global drag-and-drop** — improved file drop handling and tag suggestions after import
- **Drop zone overlay** — dismiss, styling, and re-drag hover state fixes

## [1.0.5] - 2026-07-09

### Fixed

- **Filters panel** — blur, search, and list styling
- **Electron startup** — relative shared imports in API repos
- **Checkbox meta values** — correct boolean handling; removed unused `nameSingular`
- **Auto-color migration** — updated migration count expectations
- **Find missing media** — nullable missing count type in search results

## [1.0.4] - 2026-07-09

### Added

- **Tag color from cover** — pick tag color from `main.jpg` with category auto-color setting
- **On-demand video thumbnails** — generate missing thumbs when serving thumb files
- **Website capture scripts** — Playwright-based screenshot capture from a running app
- **Database icons** — visual database identifiers in settings
- **Tag page design hint** — compact info alert for layout options

### Changed

- **Tag category settings** — simplified configuration; layout switching moved to tag pages
- **Tag page layout switcher** — restored button-toggle design
- **Video timeline thumbs** — per-frame timestamp instead of file duration

### Fixed

- **Database settings** — responsiveness and maintenance status loading
- **Video static preview** — switching from grid to thumb view
- **Legacy backup repair** — schema repair and favorite heart display
- **Schema null normalization** — TypeScript build compatibility

## [1.0.3] - 2026-07-08

### Fixed

- **Windows console validation noise** — API response schemas accept SQLite `null` values for media timestamps, totals, and meta names
- **Tag suggestions on import** — accept plain file path strings in `suggestTagsFromPaths` requests
- **Open file/folder on Windows** — prefer native Electron IPC for `openPath` instead of the HTTP task endpoint
- **Electron IPC crashes** — ignore malformed `getItemsFromDb` / `removeEntitiesFromState` payloads in preload
- **Transcode defaults** — read transcode settings from `config.json` when keys are missing from server config

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
