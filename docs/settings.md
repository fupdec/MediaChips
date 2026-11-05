# Settings navigation

Settings are organized by task. All previous setting values, actions and section
links remain available; this change does not migrate or reset stored preferences.

## Sections

- **General**: language, application behavior, LAN/browser access, password,
  password hint, idle auto-lock and SFW mode.
- **Appearance**: theme, colors, zoom, navigation, cards, filter matching and display, editor display,
  spacing, pagination and virtual image grid. The change-history button in the
  top bar is optional and hidden by default; enable it under Navigation.
- **Viewing**: system/built-in player, separate window, playback position, view counting,
  transcoding, permanent conversion quality/resolution, transcode cache,
  static/hover previews and image slideshow interval/loop.
- **Catalog & tags**: tag categories and default category, metadata fields,
  field pinning, media types, chip recipes, quick tags and folder tags.
  Field pinning and quick tags no longer require an Advanced switch.
- **Sources & import**: watched folders and exclusions, cloud accounts, NAS,
  import options, metadata transfer and enabled Plex/Emby/Jellyfin/Stash panels.
- **Processing & maintenance**: library health, video/image previews, chapters,
  file/visual fingerprints, codec and creation-date backfills, CLIP search index,
  faces, duplicates and copy discovery, AI tag image upscaling, path replacement,
  missing-file recovery, library tag parsing, Local AI, metadata scraper plugins
  and generated-image cleanup.
- **Data & backups**: library creation/switching, backups and restore, data folder,
  change history and library reset. Backup management has its own visible section.
- **Plugins**: installation, permissions, status, enabling/disabling and removal.
  An enabled plugin's card links to its settings at their current location.
  Unknown third-party settings contributions retain their declared tab.
- **About**: application information, license activation and device management.

## Search

The search dropdown floats over navigation without moving menu items. Matching
parts of titles, category names and descriptions are highlighted.

Settings also appear as a separate group in global search (the `/` shortcut),
using the same localized index. Click a result or select it with arrow keys and
press Enter to open its section. Media and tag results remain available. Settings
are excluded while filtering by pinned tags.

Search above the navigation matches section titles and translated control labels
and descriptions, including dependent controls in currently closed sections.
Multiple words must all match. Matching ignores case, accents and Russian е/ё.
Click a result or press Enter for the first result. Escape clears the query.
A result opens and scrolls to its section; dependent controls still follow their
existing enablement conditions. The index does not read user passwords or values.
Available plugin panels are indexed by plugin name and description.

Conversion quality, maximum resolution, all choices and their explanations are
localized in all eight supported interface languages. These preferences apply to
permanent conversions; the resolution limit never upscales a smaller source.

## Existing links

The section determines the destination, even if an old URL names its former tab:

- `/settings?tab=general&section=video_player` opens Viewing.
- `/settings?tab=appearance&section=appearance_image_viewer` opens Viewing.
- `/settings?tab=appearance&section=appearance_sfw` opens General.
- `/settings?tab=files&section=watched_folders` opens Sources & import.
- `/settings?tab=files&section=folder_tags` opens Catalog & tags.
- `/settings?tab=files&section=bulk_paths` opens Processing & maintenance.
- `/settings?tab=library&section=parse_library_tags` opens Processing & maintenance.
- `/settings?tab=database&section=find_duplicates` opens Processing & maintenance.
- `/settings?tab=database&section=backups` still opens backup management.
- `oshash_backfill` and `content_hash_backfill` still target `fingerprint_backfill`.
- `google_drive` and `nas` select the requested provider instead of the remembered
  provider. They work on initial load and subsequent navigation.
- Plugin section IDs still work after their panels move to import or maintenance.

Tab-only aliases `tools`, `meta`, `media`, `assignment`, `video`, `files`,
`data_scraper` and `adult` remain supported. Field-pinning queries such as `view`,
`mediaTypeId` and `metaId` remain intact. Existing documentation article IDs remain
available; help navigation and spotlight selectors use the reorganized sections.

## Maintaining navigation

`src/utils/settingsNavigation.ts` owns core navigation, stable section IDs,
destinations, compatibility aliases and searchable translation keys. Keep its
search keys aligned with controls when adding preferences. Do not index runtime
user values. The host relocates known plugin panels without changing the plugin
contribution API. Update `shared/documentation/structure.ts`, translated articles
and this guide when moving a section.
