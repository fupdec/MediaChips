# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini CLI, …) working in this repository.
`CLAUDE.md` imports this file, so keep the rules here and keep them tool-neutral.

## What this is

**MediaChips** — an open-source (GPL-3.0) desktop app for organizing local videos, images, audio and text with
custom metadata ("chips"), tags, filters and previews. It ships as an **Electron** app, as a **Docker / NAS server**
(`express`, default port 12321) and as a PWA. Remote sources (Google Drive, OneDrive, Dropbox, SFTP, FTP, WebDAV) and
Jellyfin/Plex/Emby/Stash importers exist as well.

Stack: Vue 3 + Vuetify 3 + Pinia + vue-i18n + Vite (UI) · Express 5 + better-sqlite3 + Drizzle ORM (backend) ·
Electron (shell, native mpv player addon) · Vitest + Playwright (tests) · TypeScript everywhere · Node **22** (`.nvmrc`).

## Architecture in one screen

```
src/        Vue UI (renderer). pages/, components/, stores/ (Pinia), composable/, services/, i18n/, router/
api/        Backend: routes/ -> controllers/ -> services/ -> db/ (Drizzle, repositories/, schema/)
            plugins/ (server side of Stash/Jellyfin/Plex/Emby/TMDB/adult), workers/, middleware/
app/        Server bootstrap (server.ts), tasks/, LAN discovery
electron/   Main-process modules (window, tray, menu, IPC bridge, auto-updater, native player, nav guard)
main.ts     Electron entry point (loaded through electron/runMain)
shared/     Code used by UI + api + electron (types, pure logic). Imported as `@shared/*`
packages/   Workspace-like packages (file: deps): plugin-* , processing-core, frame-extraction, background-storyboard, remote-transcode
plugins/    Packaged official plugins (zips built by scripts/pack-plugin-*.mjs)
scripts/    Build/dev/release tooling (*.mjs) and its tests
e2e/        Playwright specs (they spin up their own server + temp profile)
docs/       Design/release/security notes (some in Russian). Read the relevant one before touching that area
```

Request flow: UI (`src/services`) -> HTTP/WebSocket -> `api/routes/*.routes.ts` -> `api/controllers/*.controller.ts` ->
`api/services/*` -> `api/db` (SQLite). Electron adds IPC (`electron/preload.ts`, `bridgeIpc.ts`, `shellIpc.ts`).

## Critical gotchas (read before editing)

1. **Never edit `.js` files next to `.ts` files.** `api/**/*.js`, `app/**/*.js`, `shared/**/*.js`, `electron/*.js`,
   `main.js`, `scripts/*.js` are gitignored build output (copied back by `scripts/compile.mjs`). Edit the `.ts`
   source only. If a `.js` and `.ts` disagree, the `.ts` is right. Ignore `.js` hits in search results.
2. **Generated/derived files — do not hand-edit or commit churn:** `shared/sfwCompiled.ts`, `shared/msStoreCompiled.ts`
   (overwritten by `scripts/compile.mjs`), `dist/`, `release/`, `.*-build/`, `.cache/`, `coverage/`, `plugins/official/adult/main.cjs`.
3. **Database changes need a Drizzle migration.** Schema lives in `api/db/schema/`, migrations in
   `api/db/migrations-drizzle/` (generated with drizzle-kit, config in `drizzle.config.ts`). Never edit an already
   released migration. Upgrades of existing user libraries must stay safe — read `docs/upgrade-safety.md` and extend
   `api/db/upgradeSafety.test.ts` when touching schema, backups/restore or repairs. A DB from a newer schema must be rejected, not "repaired".
4. **User data is sacred.** Never delete/overwrite user media or library files outside managed paths; deletion and
   thumbnail output are deliberately confined to managed paths (see recent security commits). Don't weaken those checks.
5. **Security-sensitive surfaces** — XSS hardening, DNS-rebinding/host checks, window navigation guard
   (`electron/navigationGuard.ts`), LAN access with password, OAuth token storage. Never put credentials/tokens in
   `public/` (the Vite config refuses to start if `public/drive-oauth-tokens.json` exists), logs, URLs or the library ZIP. See `docs/security-and-privacy.md`.
6. **Build variants.** `MEDIA_CHIPS_SFW=1` strips the adult plugin API (store builds); `MEDIA_CHIPS_MSSTORE=1` is the
   Microsoft Store build; `MEDIA_CHIPS_MAS=1` is stricter. Code touching adult/plugin features must behave in both
   variants (`shared/buildFlags.ts`).
7. **Pro / trial gating.** Some features (cloud/NAS sources, Jellyfin/Plex/Emby import, AI search, faces, auto-merge
   duplicates, multiple libraries) are Pro with a 30-day trial; state is in `pro-access.json`. Don't make gating bypassable client-side only.
8. **`better-sqlite3` is a native module** compiled for either Electron or system Node. `npm test` runs
   `scripts/ensure-sqlite-tests.mjs` which rebuilds it when needed; E2E rebuilds it too. **Do not run unit tests and E2E at the same time.**
9. **i18n.** UI strings go through vue-i18n. `src/i18n/en.ts` is the source; 13 locales exist (`cn de es fr it ja ko pl pt ru tr tw`). Add new keys to
   `en.ts` at minimum and keep key sets consistent (`src/i18n/locales.test.ts` guards this). Never hard-code user-visible English in templates.

## Commands

```bash
npm install                 # postinstall prepares native bits; Node 22
npm run dev                 # Vite UI dev server (HMR), port 3000
npm run electron            # full Electron dev: watches electron/ api/ app/ shared/, rebuilds, relaunches
npm run server:dev          # backend only with nodemon (http://localhost:12321)
npm run server              # backend only, one-shot  (server:lan = bind to LAN)

npm test                    # all unit tests (vitest; ui=jsdom, node=plain node)
npx vitest run <path|pattern>          # prefer this: run only what you touched
npx vitest run api/services/nas        # example
npm run test:e2e            # Playwright (needs port 12321 free, or MEDIA_CHIPS_E2E_PORT=12329); slow, run only when asked/needed
node --test scripts/release.test.mjs   # release workflow checks (excluded from vitest)

npx eslint <changed files>             # lint (full: npx eslint .)
npm run build               # vue-tsc --noEmit && vite build
npm run pack | dist | dist:sfw         # Electron packaging — slow, only when asked
```

### Type-checks (CI runs all of them; run the ones for the area you changed)

| Changed area            | Command                                   |
| ----------------------- | ----------------------------------------- |
| `src/` (Vue/UI)         | `npx vue-tsc --noEmit`                    |
| `shared/`               | `npx tsc -p tsconfig.shared.json` **and** the area-specific ones below |
| `api/` + plugin servers | `npx tsc -p tsconfig.api-strict.json`     |
| `app/`                  | `npx tsc -p tsconfig.app-strict.json`     |
| `electron/`             | `npx tsc -p tsconfig.electron-strict.json`|
| `main.ts`               | `npx tsc -p tsconfig.main-strict.json`    |
| `scripts/*.ts`          | `npx tsc -p tsconfig.scripts-strict.json` |
| root/config TS          | `npx tsc -p tsconfig.node.json --noEmit`  |

CI sets `NODE_OPTIONS=--max-old-space-size=8192` for these; set it locally if tsc runs out of memory.
A change in `shared/` can break UI, API and Electron at once — check all three.

## Definition of done

- Relevant type-check(s) pass, `eslint` clean on changed files, the nearby unit tests pass (`npx vitest run <area>`).
- New logic has a test next to it (`foo.ts` -> `foo.test.ts`). Bug fixes get a regression test.
- User-visible change -> add a line under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog sections: Added / Changed / Fixed / Security).
- Don't claim UI behaviour is verified unless you actually ran it; say what you verified (types, unit tests) and what you didn't.

## Code conventions

- TypeScript, ES modules in source; **2-space indent, single quotes, no semicolons** (match surrounding code).
- `@typescript-eslint/no-explicit-any` is off, but prefer real types in new code; unused vars must be prefixed `_`.
- Vue: `<script setup lang="ts">`, Composition API, Pinia stores in `src/stores`, reusable logic in `src/composable`.
  Import UI code with the `@/` alias (= `src/`), shared code with `@shared/`.
- Backend layering: routes are thin, controllers parse/validate, services hold logic, `api/db/repositories` hold SQL/Drizzle.
  Put pure logic in small testable modules (the repo has many `*Math.ts`, `*Scoring.ts`, `*Iterate.ts` helpers with tests for this reason).
- Long/background work goes through the background-task system (`api/services/backgroundTasks.ts`, `bulkJobs.ts`) with progress and cancellation — not ad-hoc timers.
- Match existing naming: `Foo.controller.ts`, `Foo.routes.ts`, `fooBar.ts` services, `FooBar.vue` components.
- Prefer small, focused diffs. Don't reformat unrelated code, don't rename/move files without need, don't add dependencies without a reason (the app ships to users; mind bundle/asar size and licenses — GPL-3.0).
- Tests: Vitest, colocated `*.test.ts`. UI tests (`src/**`, `packages/**`) run in jsdom, everything else in node. Use temp dirs/DBs; never touch real libraries or `app_storage/`.
- Comments explain *why*; code and comments are English.

## Git

- Commit messages: short English imperative summary, no prefix convention (e.g. `Add bulk detach of media copies`, `Fix wrong duration on NAS cards in the native player`).
- Don't commit `.env`, tokens, `public/config.json`, `app_storage/`, `models/`, `databases/`, build output.
- The working tree often has unrelated local edits — stage only the files for your task, never `git add -A` blindly, never rewrite history or force-push unless asked.
- Releases (version bump, tags, `release.yml`) follow `docs/release-process.md`; don't touch them unprompted.

## Where to read more

`README.md` · `DOCKER.md` · `INSTALLATION.md` · `docs/` — especially: `release-process.md`, `upgrade-safety.md`,
`security-and-privacy.md`, `media-sources-model.md`, `sources.md`, `nas-integration.md`, `webdav-integration.md`,
`cloud-accounts-and-processing.md`, `original-operations.md`, `copy-discovery.md`, `change-history.md`, `player-transcoding.md`, `settings.md`.
