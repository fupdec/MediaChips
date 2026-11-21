# MediaChips — идеи UX и продукта

Не Discord-wishlist, а куда копать поверх текущего стека: chips + browse + player + local AI. Уже есть бэклог запросов пользователей — здесь фокус на упрощении жизни и сильных «вау»-слоях.

## Verdict

Не нужно ещё 20 фич. Нужно: (1) спрятать maintenance за wizard, (2) дать Inbox/Review для новых файлов, (3) использовать `mediaCreatedAt` и CLIP как discovery, а не как Settings-задачи.

## Status vs master

Updated 2026-11-22 against the code and the CHANGELOG (most of this shipped in 1.9.0).

| Idea | Status | Notes |
|------|--------|-------|
| Library setup wizard | Done | Prepare library with phased steps and per-step ETA; Database settings regrouped into Essential / Search & AI / Experts |
| New media Inbox | Done | Home widget, sidebar entry, triage queue (untagged + unrated), watched-folder losses; palette action |
| Command palette (⌘K) | Done | Global search commands mode |
| Inline edit in Inspector | Done | Rating, favorite, tags and pinned metadata; view/edit toggle, auto-save on item switch. Thumbs and scrapers still use the full editor |
| Empty states → CTAs | Done | Media/tags/playlists/markers + Home Similar/Spotlight/Calendar + Inbox empty → one primary next step |
| Saved views (filter+sort+group+card) | Done | Store filters, sort, group-by, card size and the AND/OR join; chips live in the filters panel under Presets |
| Created-at calendar | Partial | `WidgetCreatedCalendar` on Home; no calendar/timeline view inside the media list |
| Review / keyboard tagging | Done | Fullscreen Review mode: digits rate, F favorite, Q–O pinned tags, arrows/HJKL move; Inbox handoff (D = done & next) |
| Home Similar + Continue | Done | CLIP-neighbor widget with Continue exclusions and a context-menu entry |
| Auto-collections | Partial | Group-by + smart playlists; no auto entities from path / date / duration |
| Trash / soft-delete 30d | Done | Media, tags, markers, playlists and saved views; permanent delete is an explicit choice in the confirm dialog |
| Session focus tag workspace | Done | Pin a tag/performer, browse with or without it, apply to the selection |
| Settings Essential / Search & AI / Experts | Done | Jargon is mostly hidden behind the wizard; re-check wording per release |
| `mediaCreatedAt` pipeline | Done | Extract + sort + filter + group + backfill |

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

Items 1, 2, 3 and 5 are shipped (see the status table). What is left:

1. ~~Library setup wizard~~ — done
2. ~~New media Inbox~~ — done
3. ~~Review / keyboard tagging~~ — done
4. **Created-at calendar** — extend the Home widget into a calendar/timeline view in the media list
5. ~~Command palette + empty-state CTAs~~ — done
6. **Auto-collections** — from path / date / duration, without manual smart-playlist setup

## Do not add now

VR player, cloud sources, in-app transcode suite, biometric lock — different product. Strength: local library + chips + filters + player markers. Reinforce the core.

## Related

- User wishlist / Discord feature requests (community history)
- This canvas is the product lens, not a feature dump

## Quick polish checklist (S)

Take small items from the user wishlist in parallel as fast wins while shipping the top-5.
