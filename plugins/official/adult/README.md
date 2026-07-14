# Adult features plugin

Official MediaChips plugin for performer/scene scrapers and ThePornDB.

## Who needs this zip?

| Build | Adult features |
|-------|----------------|
| **Standard** | Already bundled — enable in Settings → Plugins (no zip needed). |
| **SFW** | Not bundled. Download this zip, then **Install from zip**. |

## Install (SFW)

1. Download `mediachips.adult-0.1.0.zip` from [mediachips.app/plugins](https://mediachips.app/plugins)
2. Open MediaChips → Settings → Plugins → **Install from zip**
3. Enable **Adult features** in the list
4. Turn on adult content in Privacy settings and set your ThePornDB API key under Adult

## Package layout

```
plugin.json   # required manifest
README.md     # this file (optional)
```

Zip so `plugin.json` is at the archive root (or inside a single top-level folder).

## Status

Manifest + install path work now. Scraper UI/API load from this zip in SFW builds as the plugin runtime lands; until then, standard builds remain the supported path for scrapers.
