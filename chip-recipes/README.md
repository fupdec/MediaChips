# MediaChips chip recipes

Community metadata templates (chips / meta fields + optional seed tags).  
No media files — schema only.

## Share on Discord

1. In the app: **Settings → Library → Chip recipes → Export recipe**
2. Attach the `{id}.chiprecipe.json` file in Discord `#chip-recipes`
3. After curation it appears in the in-app catalog

The chat message text is optional. The catalog reads **metadata inside the file** (`name`, `id`, `category`, …).

## Layout

```
index.json                 # generated — do not edit by hand
recipes/*.chiprecipe.json  # source of truth
```

Rebuild the index after adding or changing recipes:

```bash
node scripts/build-chip-recipe-index.mjs
```

## Publish

Host this folder (or a copy) on any static HTTPS host, e.g.:

- GitHub: `https://raw.githubusercontent.com/mediachips/chip-recipes/main/index.json`
- Website: `https://mediachips.app/recipes/index.json`

Point the app at the catalog with env `CHIP_RECIPE_CATALOG_URL` if needed.
