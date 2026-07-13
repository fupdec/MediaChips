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

Server (host tree, adult-owned): `api/plugins/adult/` — TPDB client, scraper controller, API key resolution.

Host keeps thin re-exports under `src/stores/scraper.ts` etc. so existing `@/…` imports keep working.

Server-side TPDB client and `/api/scraper/*` routes live under `api/plugins/adult/`
(owned by this plugin). Users set a personal ThePornDB API key in Adult settings;
requests go directly to `api.theporndb.net` / GraphQL (no mediachips.app proxy).
`TPDB_API_KEY` env remains a fallback.

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
