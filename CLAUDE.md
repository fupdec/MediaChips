@AGENTS.md

## Claude Code specifics

- The shared rules live in `AGENTS.md` (imported above). Edit that file, not this one, for anything tool-neutral.
- Use `Grep`/`Glob` with `--glob '!**/*.js'` (or filter `.ts`) — compiled `.js` twins next to `.ts` files are noise and must never be edited.
- After code changes, stop at type-check / lint / the relevant `vitest` files. Do not drive the browser or the Electron UI to verify; the owner tests UI themselves.
- Respond to the owner in Russian unless asked otherwise; code, comments and commit messages stay in English.
