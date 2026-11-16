# Release publication

## Local preparation

Before choosing a new version, check `git status --short` and existing version
tags. Include all intended source files, including untracked modules, and keep
release notes in `CHANGELOG.md` under `Unreleased` until the version is chosen.
Do not reuse an existing release tag or treat old files in `release/` as builds
of the current working tree.

Run `npm test`, `npm run build`, `npx eslint .`, and the TypeScript checks listed
in `.github/workflows/ci.yml`. Then run `npm run test:e2e` with port 12321 free,
or use `MEDIA_CHIPS_E2E_PORT=12329 npm run test:e2e` alongside a running app.
E2E creates and removes its own temporary profile and refuses to reuse an
existing server. Run unit tests and E2E sequentially: E2E preparation
rebuilds `better-sqlite3`, which can temporarily remove the native binding while
unit tests are using it. HTTP/SFTP tests need permission to listen on loopback
ports; `listen EPERM` is an environment failure, not a passing acceptance test.

Production builds copy only UI assets from `public/icons`, `public/images`, and
`public/loading.html`. Host-local `public/config.json`, backups and credentials
must not appear in `dist` or the packaged asar. The UI bootstraps through
`/api/config`; Electron supplies its actual backend port through IPC.

For cloud and remote-source acceptance, follow `cloud-oauth-release.md`,
`release-blockers-remote-sources.md`, and `web-video-release.md`. For a signed
macOS distribution, configure `build/mac-signing.env.example` and verify signing
and notarization on the newly built artifact. The default ad-hoc build does not
confirm those requirements.

## CI and publication

`release.yml` calls `ci.yml` locally with `workflow_call`. Type checks, lint,
unit tests with coverage, E2E and Linux packaging must succeed before the
Windows/macOS/Linux installer matrix starts. Publication needs both jobs.
Every checkout uses `github.sha`; there is no dependency on the timing or status
of a separate push/PR workflow. Manual dispatch must select a version tag.
The tag must equal `v` plus the `package.json` version. Builds explicitly disable
electron-builder publication. Only the final publication job has write access.

Runs for the same ref are serialized without cancelling an active publication.
Artifacts are downloaded only from this run, kept in separate platform folders.
Before any remote mutation, the publisher rejects duplicate names, missing
platforms/metadata, wrong versions, missing update targets and SHA512/size
mismatches. YAML URLs must name local release assets.

A new release is created as a draft with the checked commit as target. Installers
and related files upload first and are downloaded again to verify their bytes.
Only then are `latest*.yml` uploaded and similarly verified. The tag is checked
against the commit before upload and immediately before clearing draft status.

A partial upload or verification failure leaves the release as a draft. Rerun the
workflow (or failed publication job while its build artifacts are retained).
An existing draft may be replaced only when its target commit exactly matches.
The retry removes old metadata first, then all remaining old assets, and uploads
the entire validated set again. This also removes artifacts left by older builds.
Drafts with a branch/unknown target require manual inspection rather than guessing
which build they contain. If artifacts have expired, rerun the complete workflow.

An existing public release is never changed by this workflow, even on a rerun
after publication succeeded but the runner lost its response. The rerun fails
explicitly; inspect the existing release. Publish fixes under a new version tag.
This avoids exposing old metadata alongside replaced or missing installers.

Local regression check (Node 22):

```sh
node --test scripts/release.test.mjs
npx eslint scripts/publish-release.mjs scripts/release.test.mjs
```

The tests validate workflow dependency/permission structure and exercise the
publisher with a fake GitHub CLI, including partial failures. They do not publish
anything or replace a live release acceptance test.
