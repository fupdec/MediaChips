# Changelog

All notable changes to MediaChips are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.8.1] - 2026-08-11

### Fixed

- **Windows Electron shell** — window minimize/maximize/close and Help → DevTools work again; the preload script no longer fails inside `app.asar` looking for `shared/electron/ipc`
- **System menu shortcuts** — accelerator labels are spaced and right-aligned in the Windows title-bar menus
- **Windows CI / postinstall** — bundle Electron preload via the esbuild JS API so `npm ci` no longer fails spawning the esbuild binary on Windows runners

## [1.8.0] - 2026-08-11

### Added

- **New database starter meta** — optional Tags category (parser-enabled, pinned to Videos/Images) when adding a database; on by default
- **Home chart stats widget** — line chart of media/tag activity (added, viewed, edited) with 7D/30D/90D/1Y/All ranges (enabled by default)

### Fixed

- **Library grid after API hiccups** — a failed list refresh no longer wipes an already-loaded page back to “Nothing here yet / add files”; file-existence check errors no longer mark cards as missing
- **Face recognition on Windows** — temp `mediachips-faces-*` cleanup no longer fails the scan with `EPERM: operation not permitted, unlink` (read-only / locked files after frame extract)
- **Release build** — fix `vue-tsc` errors in mixed-tag autocomplete menu props so the frontend CI/release build can ship

### Changed

- **Settings sidebar** — clearer section titles (e.g. Library & tags, Database & backups) with stronger nav label weight

### Removed

- **Video frame auto-tag / object recognition tagging** — removed Enhance “Auto-tag from what’s on screen”, Recognize objects, and related APIs; CLIP visual-search indexing and chapter labeling remain

## [1.7.1] - 2026-08-11

### Fixed

- **Release build** — restore missing `percent` on generation stream events so `vue-tsc` / frontend CI can ship again

## [1.7.0] - 2026-08-11

### Added

- **Player neighbor previews** — hover cards for previous/next playlist items; up-next card above the timeline in the last 5 seconds (timeline scrub preview disabled in that window)
- **AI model download progress** — streamed progress, consent prompts, and clearer status while downloading local models
- **Duplicate database** — copy a library database with an optional generated-cache copy
- **Duplicate tags / categories** — duplicate actions for tag categories and tags
- **System menus** — expanded tray / Dock / Jump List menus with locale sync and a Mac tray option

### Changed

- **Locales** — sync translations and replace remaining hardcoded English UI strings
- **Adult scene scraper** — stronger tag mapping and meta ensure/apply flow
- **Import / face / CLIP tooling** — download and tagging UX polish around model installs and face detect streams

### Fixed

- **Plugin settings** — persistence no longer drops values; edit-dialog thumbs stay fresh after updates
- **Tag autocomplete** — mid-string, synonym, and character-gap matching for tag categories
- **Tag hover cards** — no longer stale after editing a tag
- **Hover / big preview sound** — respects the play-sound setting again

## [1.6.1] - 2026-08-10

### Fixed

- **App exit** — App → Exit and force-quit paths reliably close the window and process (no hang when tray/minimize-to-tray interferes)
- **Open file folder** — reveal/open in the OS file manager no longer fails with “Command failed” under the Electron Node API child (especially Windows Explorer exit code 1)
- **Drag-and-drop add** — capture real file paths in preload so drops are not rejected as unmatched extensions
- **Library infinite scroll** — a failed page append no longer wipes the loaded list back to “add files”
- **View zoom** — use CSS zoom instead of Chromium zoom factor so nested settings scroll still works when zoomed

### Changed

- **Home widgets** — soft outlined cards for media, tags, and markers with clearer marker borders

## [1.6.0] - 2026-08-10

### Added

- **CLIP semantic search** — describe a scene to find media; query auto-translate for UI languages; play hits at the matching grid tile
- **Find scene** — visual search from a described moment; open hits near the matching timeline tile
- **Similar media wall** — explore CLIP neighbors with health tips and an explore loop
- **Post-add smart wizard** — path tags, grids, faces, CLIP index, chapters, neighbor-tag suggestions, organize, and TPDB scrape steps
- **Library health score** — safe fix queue and snoozeable alerts
- **Clip Studio** — select, export, and reveal clips; reels and multi-select for markers and playlists
- **NL → playlist mix** — build a mix from filters / CLIP from the filter bar and global search
- **Blind Person auto-tags** — optional Person N tags for unlabeled face clusters (off by default)
- **Auto chapters** — scene + silence detection with readable titles (heuristics / Local AI / CLIP-aware)
- **Any-tag player marks** — favorite, bookmark/chapter, or any library tag; no separate Marks in player flag
- **Stash / Jellyfin bidirectional sync** — pull metadata and push ratings/tags for already matched media
- **Media merge** — keep one item and remap linked metadata; duplicates review in Database settings
- **More like this** — visual-hash neighbors on the media list
- **Text / audio** — in-app text preview and search; audio covers from ID3
- **Zip galleries** — import images from zip archives; path tags from folder/zip paths
- **Chip recipes** — installable meta/chip presets for common library setups
- **Local AI assist** — filter goals and explicit assist in global search

### Changed

- **Playback** — prefer direct play before live transcode; safer hover preview remux/live fallback for layout-broken MP4s
- **Face match default** — new databases use Suggest only (not auto-apply)
- **Smart wizard** — **Enhance now** as the safe one-click default; CLIP / neighbor tags suggest for review instead of auto-applying
- **Path tag parser** — enabled by default for new/first-assigned tag categories (opt out in field settings)
- **Meta manager** — Capabilities tab renamed to Built-in fields; clearer category menus
- **Edit dialog** — compact tag color control and clearer value restore buttons
- **Settings** — compact vertical nav on mobile; remove obsolete app cache-clear UI
- **API recovery** — reconnect after local API disconnects without a full app restart
- **Browser layout** — sole library layout; mobile-friendly control deck; denser edit dialogs
- **Huge galleries** — virtual masonry for large image sets; infinite card grids stay non-virtual with throttled loads and less CLS
- **Performance** — Slim SQL projections, Sharp for hashes/faces, API in a separate Electron Node child, larger image data window with safer thumbs; faster auto chapters

### Fixed

- **Packaged app launch** — rewrite Electron `../api|app|shared` requires onto `.backend-build` so the asar finds modules after the packaging change (fixes missing `../api/types/errors` on startup); spawn the API child with a real directory `cwd` (asar path is a file → `ENOTDIR`); ship Drizzle SQL migrations in the asar for new databases
- **Hover preview** — wrong scrub-frame flash, sticky unavailable cache (TTL), leave fade / scroll guard
- **WebM duration** — probe packet PTS when container metadata is missing (live chunks / playability)
- **Find scene / mix playlists** — semantic seeks land on the matching tile instead of EOF or stolen resume
- **FFmpeg thumbs** — single-image thumbnail generation edge cases
- **Semantic index UX** — partial CLIP index no longer looks “ready”; locale strings for new features
- **Duplicates merge** — confirm before single-group merge, especially when deleting loser files
- **Locale switching** — image viewer chrome and related UI polish
- **Feedback bugs** — starter meta, shift-select, tag counts, relaunch, page settings, splash

## [1.5.0] - 2026-08-05

### Added

- **Browser layout** — Eagle-style library view with tags sidebar, inspector panel, compact control deck, and docked filters panel
- **Collapsible sidebar** — icon rail with library links, tag categories, settings, and tracked folders
- **All Tags page** — manage categories and move tags in bulk
- **Duplicate finder** — scoped duplicate search and visual grid fingerprinting
- **Grid multi-select** — keyboard range and shift selection in item grids
- **Path-regex tags** — extract tags from paths in array meta fields with multi-OS presets and regex builder UX
- **Mixed tag input** — combined tag entry UX
- **Native drag-out** — drag media cards to the desktop with a compact ghost
- **TPDB photo slots** — assign photos by size and resolution
- **Context menu** — copy tag name; move tags between categories

### Changed

- **Tag page** — auto full/minimal layout from hero images; remove compact mode and manual design switcher; polish quick filters and metadata panel
- **Inspector and filters** — collapsible inspector, compact filter chips, unified sort and group-by controls
- **Settings** — video preview settings, toast swipe-to-dismiss, reordered sections
- **Meta editing** — Basics/Pinning tabs on media types; improved field editing and path-regex UX
- **Tag names** — enforce global uniqueness; default category settings

### Fixed

- **Watched folders** — hide untracked or disabled folders in navigation; fix false active state on sidebar rail links
- **Big preview** — keep video alive on right-click for thumb capture; smoother blur and backdrop dismiss
- **openPath IPC** — failures that showed "reply was never sent"
- **Toasts** — leave animation, timeout progress, and pre-hide flash
- **Media drop overlay** — clear stuck state; resolve bundled preview images
- **Tag image upscale** — hardening and status UX
- **Settings nav** — icon alignment and locale strings
- **Update snackbar** — HTML preview and changelog dialog stacking
- **Build pipeline** — TypeScript, ESLint, test schema drift, and postinstall compile failures that blocked CI and Release
- **API errors** — correct HTTP status and JSON for tag name conflicts, LAN access locks, and other domain errors
- **Request validation** — body schemas on settings, tabs, playlists, saved filters, and watched-folder routes

## [1.4.0] - 2026-07-28

### Added

- **Face recognition** — detect faces in videos, enroll people from tag photos, match and auto-tag; enrollment quality checks, reference-photo tips, and CamGirlFinder-friendly review UX
- **Gender filter** — optionally keep only women or men when scanning video faces (InsightFace genderage, ~1.3 MB on demand)
- **Virtual folder tags** — folder tags with inheritance, manager UI, and compact settings lists
- **Player** — turn off live transcoding mid-playback and switch to direct play (or pick a quality to turn it back on); centered spinner while preparing/buffering
- **Connection recovery** — banner when the server is lost, with Electron auto-relaunch after prolonged downtime
- **Global search** — Tab-to-pin tags with filtered results

### Changed

- **Library chrome** — simpler first-run setup, shared SideBar/BottomBar nav, unified maintenance tools, decluttered edit dialogs (field search, unsaved-close guard)
- **Filters** — edit mode for add/reorder/delete, improved filter sets and category-style group dividers
- **App tabs** — align to the left and append new tabs at the end
- **Context menus** — regroup media actions (play/playlist, then folder/move/organize; copy near select); clearer separators and source-card highlight
- **Branding** — refresh chrome, derive page background from primary; remove logo/name from the app bar
- **Shell architecture** — route more UI/catalog sync off the global event bus onto typed app catalogs and commands
- **Locales** — catch up German, French, Spanish, Portuguese, Japanese, Chinese, and Russian for face recognition, CamGirlFinder, onboarding, and measurement units

### Fixed

- **Live transcode** — encode in short windows again (not to EOF) so scrubbing/seeking does not thrash the CPU; hand off on the actual playback position to avoid skipped frames; never upscale past the source resolution
- **Big preview** — soft drop shadow; do not open while a context menu is active
- **Tag page** — restore quick filters with co-occurrence API; offset header when filters are docked; compact mobile layout
- **Performer pictures** — stop reverting after replace due to get-file HTTP cache
- **Path parser** — match multi-word tags inside longer path chunks
- **Hover cards** — keep fully inside the viewport with cursor-aware placement
- **Select mode** — list totals and related Electron desktop chrome polish
- **Tag chips** — collapse long lists on media cards
- **Tag edit dialog** — no longer closes immediately on open
- **Context submenu spacing** — nested items align with regular list rows after divider fixes

## [1.3.4] - 2026-07-20

### Added

- **Image-only view mode** — for videos and tags
- **Global search context menu** — open the item context menu from search results
- **mpv / IINA launch** — play videos with MediaChips marks as chapters
- **Measurement units** — per-meta units with scrape conversion and type checks
- **Tag autocomplete** — load more options when scrolling the dropdown

### Changed

- **Fingerprints** — oshash-only hashing; drop full-file SHA-256 for faster add/dedup
- **Pinned meta chips** — hide empty values on media cards

### Fixed

- **Tag cards** — rating and favorite update after edit

## [1.3.3] - 2026-07-18

### Changed

- **Filters panel** — opaque background instead of glass transparency
- **README** — finish translating the troubleshooting section to English

## [1.3.2] - 2026-07-18

### Fixed

- **Docker arm64** — reuse the builder `better-sqlite3` binary instead of a second QEMU rebuild that could SIGILL

## [1.3.1] - 2026-07-18

### Fixed

- **Video wall titles** — keep library card names in sync after file rename and edit-dialog save
- **Play submenu** — MediaChips and external player actions work again from nested context menus
- **Tag profile images** — restore Edit for performer/avatar slots, including missing image types

## [1.3.0] - 2026-07-18

### Added

- **TMDB scraper plugin** — bundled movie and person scrapers with poster download and auto-color apply
- **Pinned tag auto-scrape** — TPDB/TMDB scrape actions on pinned tag-chip menus
- **Items list grouping** — group by letter, media fields, and pinned meta (server-side item groups)
- **Tag merge** — merge tags within a category and merge tag categories with same-name auto-merge; unique tag-link rows
- **Stash / Jellyfin / Plex / Emby import plugins** — library import modeled on Stash; distributable zip packages
- **Scraper meta auto-setup** — one-click creation of performer and scene scraper meta fields
- **Folder browser** — sortable name/size/modified columns; optional show-hidden toggle
- **Locales** — German, French, Japanese, and Brazilian Portuguese UI, docs, and CLIP tag localization
- **Aspect-ratio presets** — preset cards and custom inputs instead of radios
- **Add-media ETA** — show estimated time while adding media from Stash import

### Changed

- **Tag chip colors** — show colors only when explicitly saved
- **Empty number/rating meta** — keep blank instead of defaulting to 0
- **Home widgets** — collapse empty widgets; keep top-tag categories in menu order
- **Grouped chips** — enabled by default; preset card meta limited to size, views, and media count
- **Stash import** — performers image aspect ratio 5:8; extract Stash into bundled `mediachips.stash` plugin
- **Meta pinning UI** — clean up assignments on delete and refresh pinning
- **Docker Compose** — pull the published image by default
- **Translations** — catch up Spanish and Chinese for scene scraper and fingerprint keys
- **Select mode** — exit with Escape; harden context-menu i18n lookup

### Fixed

- **Card thumbs** — rating and favorite overlay visibility and styling
- **LowDB restore** — fail less often on duplicate media paths
- **LowDB migration** — avoid stack overflow on large bulk inserts

## [1.2.0] - 2026-07-17

### Added

- **Global search** — match media and tags via assigned tags, synonyms, and bookmark notes; server-side tag autocomplete for faster filters
- **Play clips by tag** — compile matching marker segments into a playable playlist from a tag page
- **In-app folder browser** — browse and pick folders when adding media; reuse across pickers with optional Electron native dialogs; fill side-panel height
- **Folder path filters** — browse library paths from filters and match media under a selected folder
- **Filter row reorder** — persistent drag-and-drop ordering for filter rows
- **Tag category field form preview** — live preview while editing meta field settings (renamed from “Tags”)
- **NAS Docker packaging** — container image and browser mount UX for network storage setups
- **Busy port prompt** — ask for an alternate listen port when Electron finds the default port in use
- **ThePornDB API key** — store the key in global app config (`config.json`) so it applies across all libraries

### Changed

- **Home favorites** — show favorite media in random order
- **Home library health** — faster health check
- **Infinite scroll** — correct title counts and raise the DOM window to 500 items
- **Electron scrolling / home widgets** — smoother scroll behavior and more stable widget layout
- **Localized filter dates** — show filter dates in the active locale and translate the date picker title
- **Video edit dialog** — clearer thumbnail action layout/labels; auto-refresh file info while editing
- **App bar tab arrows** — match scroll arrow backgrounds to the app bar color
- **Database settings** — remove the manual database size calculate button

### Fixed

- **TypeScript** — production `vue-tsc` build errors (config port, global search unions, meta preview hints, tag ids)
- **Scraper posters** — warn when poster downloads fail; stop scraped video posters from reverting to the original thumb; fix performer auto-scrape country, synonyms, and poster selection
- **Scene scrape cards** — refresh media card tags after applying a scene
- **Hover previews** — fix gray pillarboxes on vertical videos; disable card thumbnail zoom when video preview is enabled; fix big-preview context menus and watched-progress / playhead UI
- **Edit dialog** — more reliable file existence checks
- **Tag autocomplete** — prevent blur from clearing already selected chips
- **Context menus** — sibling submenus no longer stay open on hover
- **Windows system bar** — center the title and keep window controls non-draggable

## [1.1.2] - 2026-07-15

### Fixed

- **CI** — eslint scraper/`HeadersInit` failures; tests updated for `oshash` migration

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
