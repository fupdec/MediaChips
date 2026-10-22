# Release publication

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
