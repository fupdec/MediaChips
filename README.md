<p align="center">
  <img src="public/icons/logo.png" alt="MediaChips" width="120" />
</p>

<h1 align="center">MediaChips</h1>

<p align="center">
  <strong>Organize, tag, and browse your local media library with ease.</strong>
</p>

<p align="center">
  <a href="https://mediachips.app">Website</a> ·
  <a href="https://github.com/fupdec/mediaChips/releases">Downloads</a> ·
  <a href="https://github.com/fupdec/mediaChips/issues">Issues</a> ·
  <a href="https://github.com/fupdec/mediaChips/discussions">Discussions</a>
</p>

<p align="center">
  <a href="https://github.com/fupdec/mediaChips/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License: GPL-3.0" /></a>
  <a href="https://github.com/fupdec/mediaChips/releases"><img src="https://img.shields.io/github/v/release/fupdec/mediaChips?label=version" alt="Latest release" /></a>
  <a href="https://mediachips.app"><img src="https://img.shields.io/badge/website-mediachips.app-2ea44f" alt="Website" /></a>
</p>

---

MediaChips is open-source software for organizing, tagging, filtering, and playing local video files.  
Attach rich metadata — tags, ratings, favorites, bookmarks, text, dates, numbers, and more — then browse your library as visual cards, filter it in detail, and play files in the built-in or system player.

> **Privacy first.** MediaChips does not collect your data or send it anywhere. The app is fully transparent — inspect the code, extend it, or self-host it on your network.

---

## Vue 3 rewrite (v0.13.0+)

Starting with **v0.13.0**, the `master` branch is a full rewrite:

| | **Current (`master`)** | **Legacy (`legacy/vue2`)** |
|---|---|---|
| Stack | Vue 3 · Vite · Vuetify 3 · Express · Electron | Vue 2 · Webpack · Vuetify 2 |
| Last release | [v1.0.0](https://github.com/fupdec/mediaChips/releases/tag/v1.0.0) | [v0.12.5-beta](https://github.com/fupdec/mediaChips/releases/tag/v0.12.5-beta) |
| Status | Active development | Maintenance / reference only |

To work with the old codebase:

```bash
git checkout legacy/vue2
```

Older releases and tags remain available in [Releases](https://github.com/fupdec/mediaChips/releases).

---

## Features

### Media + Chips

**Chips** (metadata) are pieces of information attached to your files: tags, ratings, favorites, bookmarks, text, dates, numbers, and custom types you define.  
Each chip can be customized — add images, colors, countries, nested chips, and more.

### Browse

- Video cards with metadata, hover preview, and inline playback
- Built-in player with timeline markers, playlist, and storyboard view
- Customizable appearance: colors, card layout, chip styles, dark mode
- Tabs for videos and tags, multiple databases

### Filter & Sort

- Filter by any parameter or tag
- Save and load filter presets
- Quick filters, favorites, and global search
- Sort by rating, date, and other fields

### Share on your LAN

Open your library in a browser on any device on the local network — phone, tablet, TV, or another computer.  
Desktop builds are available for **macOS**, **Windows**, and **Linux**.

### Tools

- Watched folders for new and removed files
- File operations: move, delete, open containing folder
- Password protection
- Duplicate detection by file size
- Data scraper for adult content
- Path-based tag suggestions (optional ML model)

---

## Download

Pre-built installers are published on GitHub:

**[⬇ Download latest release](https://github.com/fupdec/mediaChips/releases/latest)**

For macOS installation notes (Gatekeeper / quarantine), see [INSTALLATION.md](./INSTALLATION.md).

---

## Build from source

### Requirements

- **Node.js** 18 or newer (LTS recommended)
- **npm** 9+
- Platform build tools for native modules (`better-sqlite3`, `ffmpeg-static`)

### Install dependencies

```bash
git clone https://github.com/fupdec/mediaChips.git
cd mediaChips
npm install
```

The ML path tag parser model is downloaded automatically when building distribution packages. For local development it is optional — run `node scripts/compile.mjs scripts && node .scripts-build/download-parser-model.js` if you use path-based tag suggestions.

### Production

1. Build the frontend into `/dist`:

```bash
npm run build
```

2. Start the server (creates config and database on first run):

```bash
npm run server
```

3. Open **http://localhost:12321** in your browser.

To expose the server on your LAN:

```bash
npm run server:lan
```

### Development

1. Build the frontend once:

```bash
npm run build
```

2. Start the backend (creates `public/config.json` on first run):

```bash
npm run server
```

3. Copy or edit `public/config.json` if needed (set `ip` to your machine's local address for LAN testing).

4. Run the backend with auto-restart:

```bash
npm run server:dev
```

5. In a second terminal, run the Vite dev server for hot reload:

```bash
npm run dev
```

6. Open **http://localhost:3000** (frontend) — API requests go to the backend port from `config.json` (default **12321**).

### Desktop app (Electron)

```bash
npm run build
npm run electron
```

### Distribution packages

| Command | Description |
|---------|-------------|
| `npm run pack` | Build unpacked app (`release/`) |
| `npm run dist` | Build installers for the current platform |
| `npm run dist -- --mac` / `--win` / `--linux` | Build installers for a specific platform |
| `npm run portable` | Windows portable build |

Build artifacts are written to the `release/` directory.

### Publishing a release (maintainers)

Desktop auto-update reads installers from [GitHub Releases](https://github.com/fupdec/MediaChips/releases).

1. Bump `version` in `package.json` (semver, e.g. `0.13.1`).
2. Move the `[Unreleased]` section in `CHANGELOG.md` to `[X.Y.Z] - YYYY-MM-DD`.
3. Commit the change on `main`.
4. Create and push a matching tag (tag must equal version with a `v` prefix):

```bash
git tag v0.13.1
git push origin v0.13.1
```

5. The [Release workflow](.github/workflows/release.yml) builds **Windows (NSIS + portable)**, **macOS (arm64 + x64 DMG/ZIP)**, and **Linux (AppImage)** in parallel and uploads them to the GitHub Release together with `latest.yml` / `latest-mac.yml` / `latest-linux.yml` required by `electron-updater`. Release notes are taken from the matching `CHANGELOG.md` section.

Expected asset names (legacy style):

| Platform | File |
|----------|------|
| Windows (installer) | `MediaChips.vX.Y.Z.Windows.Installer.exe` |
| Windows (portable) | `MediaChips.vX.Y.Z.Windows.Portable.exe` |
| macOS (install) | `MediaChips.vX.Y.Z.Mac.arm64.dmg`, `MediaChips.vX.Y.Z.Mac.x64.dmg` |
| macOS (auto-update) | `MediaChips.vX.Y.Z.Mac.arm64.zip`, `MediaChips.vX.Y.Z.Mac.x64.zip` |
| Linux | `MediaChips.vX.Y.Z.Linux.AppImage` |
6. Installed desktop apps with **Settings → About → Check for updates at startup** will detect the new version automatically.

No extra GitHub secrets are required: the workflow uses the built-in `GITHUB_TOKEN` with `contents: write`.

**Notes**

- Tag `vX.Y.Z` must match `package.json` `version` exactly.
- Portable Windows builds are published on each release but are not auto-updated in-app; users must download manually.
- macOS builds are **ad-hoc signed** (`identity: "-"`). Users still confirm the first launch via right-click → Open (see [INSTALLATION.md](./INSTALLATION.md)).
- For fully trusted macOS/Windows builds later, add secrets `CSC_LINK`, `CSC_KEY_PASSWORD` (and Apple notarization vars) to the repository.

---

## npm scripts

| Script | Description |
|--------|-------------|
| `dev` | Vite dev server with hot reload |
| `build` | Compile frontend to `dist/` |
| `server` | Start Express backend |
| `server:lan` | Start backend on `0.0.0.0` for LAN access |
| `server:dev` | Start backend with nodemon (auto-restart on TS changes) |
| `electron` | Run the Electron desktop shell (Vite + hot reload) |
| `pack` | Electron-builder — unpacked output |
| `dist` | Electron-builder — installers for the current platform (prunes foreign native binaries before pack) |
| `npm run dist -- --mac` / `--win` / `--linux` | Electron-builder — installers for one platform |
| `portable` | Electron-builder — Windows portable |

---

## Project structure

```
api/            Database models, migrations, controllers, routes
app/            Express server, tasks, default settings
databases/      Created at runtime — SQLite DBs and generated images
dist/           Production frontend build (generated)
electron/       Electron preload scripts
public/         Static assets, dev config (`config.json`)
src/            Vue 3 frontend source
models/         ML model files for path tag parser
scripts/        Build and utility scripts
```

---

## Troubleshooting

### `better-sqlite3` и Electron

Нужна **better-sqlite3 12.4.2+** — в 11.x сборка под современный Electron падает (`Context::GetIsolate` удалён из V8).

Модуль нативный и собирается под **один** runtime за раз:

| Задача | Что происходит |
|--------|----------------|
| `npm run server` / `server:dev` | `better-sqlite3` пересобирается под Node при `postinstall` и перед запуском |
| `npm run electron` | `better-sqlite3` пересобирается под Electron через `scripts/ensure-electron-native.mjs` |

Если после `npm install` видите `NODE_MODULE_VERSION` mismatch — выполните `npm rebuild better-sqlite3` или `node scripts/ensure-electron-native.mjs --force`.

На macOS 15+ (особенно macOS 26) Electron может падать с `CODESIGNING / Invalid Page` при загрузке `better-sqlite3`: `electron-rebuild` оставляет `linker-signed` бинарник, который AMFI отклоняет. `scripts/ensure-electron-native.mjs` после сборки автоматически переподписывает `.node` файлы ad-hoc (`codesign --sign -`). Если запускали `electron-rebuild` вручную — выполните `node scripts/sign-native-modules.mjs`.

`electron-builder` при `pack`/`dist` пересобирает нативные модули сам; в CI отдельный `electron-rebuild` не нужен.

### Electron and the `databases` folder

Electron 32+ may remove the `databases` directory in certain build configurations.  
Keep backups of your databases before packaging, or store them outside the app bundle.

### macOS code signing

Community macOS builds use **ad-hoc signing** so Apple Silicon does not show the unfixable "app is damaged" dialog. Users still need one right-click → **Open** on first launch. See [INSTALLATION.md](./INSTALLATION.md).

---

## Contributing

Found a bug or want a new feature?

1. Check [existing issues](https://github.com/fupdec/mediaChips/issues)
2. Open a new issue with steps to reproduce or a clear feature description
3. Pull requests are welcome

Community: [Discord](https://discord.gg/dEQPper2yu) · [Reddit](https://reddit.com/r/mediachips/)

---

## License

MediaChips is licensed under the [GNU General Public License v3.0](./LICENSE).

Copyright © 2020–2026 [MediaChips contributors](https://github.com/fupdec/mediaChips/graphs/contributors)
