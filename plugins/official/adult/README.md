# Adult features plugin

Official MediaChips plugin for performer/scene scrapers and ThePornDB.

## Who needs this zip?

| Build | Adult features |
|-------|----------------|
| **Standard (general)** | Already bundled — enable in Settings → Plugins (no zip needed). |
| **Microsoft Store / store channel** | Not bundled. Download this zip, then **Install from zip**. |

## Install (Store channel)

1. Download `mediachips.adult-0.1.0.zip` from [mediachips.app/plugins](https://mediachips.app/plugins)
2. Open MediaChips → Settings → Plugins → **Install from zip**
3. Enable **Adult features** in the list
4. Turn on adult content in Privacy settings and set your ThePornDB API key under Adult

## Package layout

```
plugin.json   # required manifest (mainEntry + uiEntry)
main.cjs      # Express scraper routes (loaded by the host)
README.md     # this file (optional)
```

Zip so `plugin.json` is at the archive root (or inside a single top-level folder).

## Runtime notes

- `mainEntry` (`main.cjs`) registers `/api/scraper/*` when the package is installed (store builds).
- `uiEntry` (`host:bundled`) tells the host to activate its adult UI modules after install+enable.
