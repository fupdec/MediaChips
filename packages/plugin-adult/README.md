# @mediachips/plugin-adult

Bundled MediaChips plugin for adult scrapers / ThePornDB.

Lives under `packages/` for co-development; can be extracted to a separate repo later.

## Contract

- Exports `adultPlugin` (`activate` / `manifest`)
- Exports `ADULT_COMPONENT_KEYS` + `createAdultComponentMap(loaders)`
- Host still mounts dialogs via `hostBridge` (loaders point into this package)

## Package layout

| Path | Role |
|------|------|
| `src/plugin.ts` | manifest + `activate()` |
| `src/components/**` | Settings + scrape dialogs + transfer UI |
| `src/stores/**` | Pinia scraper / sceneScraper stores |
| `src/services/**` | scrape APIs + auto-apply |
| `src/utils/**` | transfer/match/normalize helpers |
| `src/schemas/**`, `src/types/**`, `src/assets/**` | schemas, types, field maps |
| `src/composables/**` | batch auto-scrape helpers |
| `src/server/**` | TPDB API client + scraper Express controller (CJS via nested `package.json`) |

## SFW / App Store builds

```bash
MEDIA_CHIPS_SFW=1 npm run build:app
MEDIA_CHIPS_SFW=1 npm run dist -- --mac
# or
npm run dist:sfw -- --mac
```

With `MEDIA_CHIPS_SFW=1`:
- Vite aliases `@mediachips/plugin-adult` → `src/plugins/sfwStub`
- Scraper API routes are not registered
- Adult catalog / plugin activation is skipped
- `packages/plugin-adult` is excluded from the electron-builder asar


Server (owned by this plugin): `packages/plugin-adult/src/server/` — TPDB client, scraper controller, API key resolution.
Host mounts routes via thin re-exports under `api/plugins/adult/` (compiled CJS copies into `src/server/*.js`, gitignored).

Host bridging: `src/plugins/adult/hostBridge`. App code imports adult UI/stores from `@mediachips/plugin-adult/…` directly.

Users set a personal ThePornDB API key in Adult settings; requests go directly to
`api.theporndb.net` / GraphQL. `TPDB_API_KEY` env remains a fallback.

## Develop against the app

```bash
# from MediaChips root
npm run electron   # or npm run dev
npm run test:plugin-adult
```

Edit files in `packages/plugin-adult/src/` — Vite aliases the package to this folder.

## Extracting later

1. Copy package to sibling repo
2. Replace host `@/` usage inside the package (typedApi, DialogHeader, …) with a plugin SDK / host APIs
3. Point app dependency at the sibling package / zip install
