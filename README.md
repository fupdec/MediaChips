<p align="center">
  <img src="public/icons/logo.png" alt="MediaChips" width="96" />
</p>

<h1 align="center">MediaChips</h1>

<p align="center">
  <strong>Custom metadata. Deep tags &amp; filters. Visual browsing.</strong><br />
  Build the library interface that fits <em>your</em> collection.
</p>

<p align="center">
  <a href="https://mediachips.app">Website</a> ·
  <a href="https://github.com/fupdec/mediaChips/releases/latest">Download</a> ·
  <a href="https://github.com/fupdec/mediaChips/issues">Issues</a> ·
  <a href="https://discord.gg/dEQPper2yu">Discord</a> ·
  <a href="https://reddit.com/r/mediachips/">Reddit</a>
</p>

<p align="center">
  <a href="https://github.com/fupdec/mediaChips/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License: GPL-3.0" /></a>
  <a href="https://github.com/fupdec/mediaChips/releases"><img src="https://img.shields.io/github/v/release/fupdec/mediaChips?label=version" alt="Latest release" /></a>
  <a href="https://mediachips.app"><img src="https://img.shields.io/badge/website-mediachips.app-2ea44f" alt="Website" /></a>
</p>

<p align="center">
  <img src="docs/images/readme-hero.jpg" alt="MediaChips — tags sidebar, media grid, and inspector with custom metadata" width="920" />
</p>

MediaChips is an open-source desktop app for local **videos, images, audio, and text**.  
You shape the library: define **chips** (custom metadata), keep rich **tags**, filter by anything, and browse with **previews and view modes** that make the collection readable — not just a folder tree.

> **Private. Local. Yours.** Nothing is uploaded to the cloud. Inspect the code, extend it with plugins, or self-host on your LAN / NAS.

---

## Why MediaChips?

- **Custom chips** — ratings, favorites, dates, numbers, nested fields, or whatever schema your collection needs
- **Detailed tags** — images, synonyms, categories, hierarchy, and full tag pages
- **Deep filters** — any field or tag combination; save presets and refine until it fits
- **Visual previews** — storyboards, hover / timeline scrub, inline playback, big preview
- **View modes** — browser layout (sidebar + grid + inspector), media / tags / folders, cards you can tune
- **Stays usable at scale** — the same workflow on small libraries and on hundreds of thousands of files
- **Windows · macOS · Linux · Docker / NAS**

---

## Download

**[⬇ Download the latest release](https://github.com/fupdec/mediaChips/releases/latest)**

macOS Gatekeeper / quarantine notes: [INSTALLATION.md](./INSTALLATION.md).

### Docker / Synology / NAS

```bash
cp .env.docker.example .env   # optional
docker compose up -d
# vinsdoe/mediachips:latest — open http://localhost:12321
# or: docker pull ghcr.io/fupdec/mediachips:latest
```

Full NAS setup (volumes, `PUID`/`PGID`, mounts): **[DOCKER.md](./DOCKER.md)**.

---

## Coming from Stash?

Install the **Stash import** plugin and import from your `stash-go.sqlite` database.

MediaChips can import **scenes, performers, studios, tags, and markers** (matched by path / oshash). Galleries, performer images, and some Stash-only structures are not a full 1:1 migrate — then keep organizing with your own chips, filters, and views.

More: [mediachips.app](https://mediachips.app) · plugin docs in `plugins/official/stash/`.

---

## Features

### Chips & tags

- Built-in and custom chip types (tags, ratings, favorites, bookmarks, text, dates, numbers, colors, …)
- Rich tag profiles — images, countries, nested chips, synonyms
- Chip recipes — installable metadata presets for common setups
- Tag hierarchy, categories, merge tools, virtual folder tags

### Filters & search

- Filter by any parameter or tag (including nested fields); exact / negative conditions
- Saved filter presets; sort and group-by controls
- Global search (`/`) across names and tags
- Optional CLIP Find scene and on-device face tools

### Browse & preview

- Eagle-style browser: tags sidebar, inspector, docked filters
- Hover preview, 3×3 storyboard grids, timeline scrub, inline play
- Media, tags, and folders views; customizable cards and layouts
- Built-in player with timeline markers, chapters, and playlists

### Library tools

- Path tags & regex extraction, watched folders, bulk edit
- Duplicate finder (hybrid fingerprint + visual grid)
- Multiple databases, backup & restore, LAN / mobile browser access
- Plugins (Stash, Jellyfin, Plex, Emby, TMDB, Adult scrapers, …)

---

## Community

- [Discord](https://discord.gg/dEQPper2yu)
- [Reddit r/mediachips](https://reddit.com/r/mediachips/)
- [Discussions](https://github.com/fupdec/mediaChips/discussions)
- [Issues](https://github.com/fupdec/mediaChips/issues)

Chip recipes (metadata schemas): see [`chip-recipes/`](./chip-recipes/).

---

## Build from source

### Requirements

- **Node.js** 18 or newer (LTS recommended)
- **npm** 9+
- Platform build tools for native modules (`better-sqlite3`, `ffmpeg-static`)

### Install

```bash
git clone https://github.com/fupdec/mediaChips.git
cd mediaChips
npm install
```

The ML path tag parser model is downloaded when building distribution packages. Face detection (SCRFD ~16 MB) and recognition (InsightFace R50 ~170 MB) are **not** bundled — users download them once from Face settings (or automatically on first detect/enroll/match). For local development, run `node scripts/compile.mjs scripts && node .scripts-build/download-parser-model.js` if you use path-based tag suggestions.

### Production (server + browser)

```bash
npm run build
npm run server
# open http://localhost:12321
```

LAN:

```bash
npm run server:lan
```

### Development

```bash
npm run build
npm run server:dev   # terminal 1 — API (nodemon)
npm run dev          # terminal 2 — Vite on http://localhost:3000
```

Copy or edit `public/config.json` after first server start if you need a LAN IP.

### Desktop (Electron)

```bash
npm run build
npm run electron
```

### Distribution packages

| Command | Description |
|---------|-------------|
| `npm run pack` | Unpacked app (`release/`) |
| `npm run dist` | Installers for the current platform |
| `npm run dist -- --mac` / `--win` / `--linux` | Installers for one platform |
| `npm run portable` | Windows portable build |

### Publishing a release (maintainers)

Desktop auto-update reads installers from [GitHub Releases](https://github.com/fupdec/MediaChips/releases).

1. Bump `version` in `package.json`.
2. Move `[Unreleased]` in `CHANGELOG.md` to `[X.Y.Z] - YYYY-MM-DD`.
3. Commit, then tag and push (`vX.Y.Z` must match `package.json`):

```bash
git tag v0.13.1
git push origin v0.13.1
```

4. The [Release workflow](.github/workflows/release.yml) builds Windows / macOS / Linux assets and updater manifests. Notes: tag must match version; portable Windows is not auto-updated; macOS community builds are ad-hoc signed ([INSTALLATION.md](./INSTALLATION.md)); Developer ID + notarize via [`build/mac-signing.env.example`](./build/mac-signing.env.example).

---

## npm scripts

| Script | Description |
|--------|-------------|
| `dev` | Vite hot reload |
| `build` | Frontend → `dist/` |
| `server` / `server:lan` / `server:dev` | Express backend |
| `electron` | Desktop shell |
| `pack` / `dist` / `portable` | Electron-builder packages |

---

## Project structure

```
api/            Database, migrations, controllers, routes
app/            Express server, tasks, defaults
databases/      Runtime SQLite DBs and generated images
dist/           Production frontend build
electron/       Electron preload
public/         Static assets, dev config
src/            Vue 3 frontend
models/         Optional ML models
scripts/        Build utilities
packages/       Official plugins (stash, jellyfin, …)
```

---

## Legacy Vue 2 branch

`master` is the Vue 3 rewrite (v0.13.0+). The old stack lives on `legacy/vue2` for reference only:

```bash
git checkout legacy/vue2
```

---

## Troubleshooting

### `better-sqlite3` and Electron

Need **better-sqlite3 12.4.2+**. The native module builds for one runtime at a time:

| Task | What happens |
|------|----------------|
| `npm run server` / `server:dev` | Rebuilt for Node on `postinstall` / start |
| `npm run electron` | Rebuilt for Electron via `scripts/ensure-electron-native.mjs` |

On `NODE_MODULE_VERSION` mismatch: `npm rebuild better-sqlite3` or `node scripts/ensure-electron-native.mjs --force`.

On macOS 15+ (esp. 26), AMFI may reject `linker-signed` natives — `ensure-electron-native.mjs` re-signs ad-hoc; or run `node scripts/sign-native-modules.mjs`.

### Electron and the `databases` folder

Keep backups before packaging, or store DBs outside the app bundle.

### macOS code signing

Community builds use **ad-hoc signing**. First launch: right-click → **Open**. See [INSTALLATION.md](./INSTALLATION.md).

---

## Contributing

1. Check [existing issues](https://github.com/fupdec/mediaChips/issues)
2. Open a new issue with repro steps or a clear feature request
3. Pull requests are welcome

---

## License

MediaChips is licensed under the [GNU General Public License v3.0](./LICENSE).

Copyright © 2020–2026 [MediaChips contributors](https://github.com/fupdec/mediaChips/graphs/contributors)
