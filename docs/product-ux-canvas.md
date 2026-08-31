# MediaChips — идеи UX и продукта

Не Discord-wishlist, а куда копать поверх текущего стека: chips + browse + player + local AI. Уже есть бэклог запросов пользователей — здесь фокус на упрощении жизни и сильных «вау»-слоях.

## Verdict

Не нужно ещё 20 фич. Нужно: (1) спрятать maintenance за wizard, (2) дать Inbox/Review для новых файлов, (3) использовать `mediaCreatedAt` и CLIP как discovery, а не как Settings-задачи.

## Status vs master

| Idea | Status | Notes |
|------|--------|-------|
| Library setup wizard | Partial | Phased health guide + ETA exists; raw Database backfills still listed |
| New media Inbox | Done (v1) | Home widget + triage queue (untagged + unrated); palette action |
| Command palette (⌘K) | Done | Global search commands mode |
| Inline edit in Inspector | Partial | Edit still opens dialogs |
| Empty states → CTAs | Done (v1) | Media/tags/playlists/markers + Home Similar/Spotlight/Calendar + Inbox empty → one primary next step |
| Saved views (filter+sort+group+card) | Partial | Saved filters only |
| Created-at calendar | Partial | Sort/filter/group by `mediaCreatedAt`; no calendar UI |
| Review / keyboard tagging | Missing | — |
| Home Similar + Continue | Partial | Continue exists; Similar is menu/CLIP wall only |
| Auto-collections | Partial | Group-by + smart playlists; no auto entities |
| Trash / soft-delete 30d | Missing | Hard delete |
| Session focus tag workspace | Missing | — |
| Settings Essential / Search & AI / Experts | Partial | Health groups exist; jargon still visible |
| `mediaCreatedAt` pipeline | Done | Extract + sort + filter + backfill |

## Simplify

### Main lever: Inbox + Review

Daily ritual for new files after watch-folder: queue without tags / rating / cover.

### `mediaCreatedAt`

New visual layer — calendar/timeline, not just another sort key.

## UX: simplify life (high ROI)

| Idea | Why | Where |
|------|-----|-------|
| Master «prepare library» instead of backfill list | Hide jargon; 3 steps with progress | Settings / Home health |
| Inbox of new files: «triage» | Daily ritual instead of chaos | Home + Filters |
| Command palette (⌘K) | Discover hidden power features | Global chrome |
| Inline edit in Inspector | Fewer modals | InspectorPanel |
| Empty states → next step | «Do it now» with progress | Search / Faces / Smart playlists |
| Saved views | One click restores layout mode | Toolbar + Filters |

## Features: interesting and on-product

| Idea | Why | Where |
|------|-----|-------|
| Calendar / timeline by Media created | Visual layer on dates | Items + dates |
| Review mode: keyboard tagging | Full-screen cataloging flow | Items / Keyboard |
| Similar + Continue on Home | Sell content; health → Settings | PageHome |
| Auto-collections from path / date / duration | No manual smart playlist setup | Playlists / Path parser |
| Trash / soft-delete with 30-day undo | Less fear, less support | Media delete flow |
| Session focus tag / performer | Tag page as workspace | PageTag |

## Where complexity is excess

| Area | Now | Simpler |
|------|-----|---------|
| Settings → Database | 10+ technical tasks | Essential / Search & AI / Experts |
| Advanced library options | Meta / quick tags / parse behind toggle | One-time onboarding card |
| Plugins | Separate tabs + scraper jargon | «Connect source» wizard |
| Home health widget | Index checklist | One readiness bar + Continue / Inbox |
| Feature discovery | Empty-state hints / docs | What's new + 3 actions after import |

## Top-5 (in order)

1. **Library setup wizard** — collapse Database backfills
2. **New media Inbox** — watch folders already exist; add the ritual
3. **Review / keyboard tagging** — chips as a fast cataloging tool
4. **Created-at calendar** — natural next step after `mediaCreatedAt`
5. **Command palette + empty-state CTAs** — cheap discovery for built features

## Do not add now

VR player, cloud sources, in-app transcode suite, biometric lock — different product. Strength: local library + chips + filters + player markers. Reinforce the core.

## Related

- User wishlist / Discord feature requests (community history)
- This canvas is the product lens, not a feature dump

## Quick polish checklist (S)

Take small items from the user wishlist in parallel as fast wins while shipping the top-5.
